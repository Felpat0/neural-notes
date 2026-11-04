// Operazioni della coda offline e come si riapplicano ai dati: le pagine possono arrivare dalla
// cache del service worker (vecchie), quindi le modifiche ancora da inviare si rimettono sopra.
// Solo logica pura: la coda vera sta in outbox.svelte.ts.
import type { Repeat } from '#lib/repeat.ts';
import type { TodoItem } from '#lib/todo-api.ts';

/** Corpo di una richiesta a /api/todo; i campi in più (item, items, at) servono solo qui. */
export type TodoOp =
	| {
			op: 'create';
			ids: string[];
			texts: string[];
			time: string | null;
			repeat: Repeat | null;
			checklistId?: string;
			day?: string;
	  }
	| { op: 'toggle'; id: string; done: boolean }
	| { op: 'text'; id: string; text: string }
	| { op: 'time'; id: string; time: string | null }
	| { op: 'repeat'; id: string; repeat: Repeat | null }
	| { op: 'delete'; id: string }
	| { op: 'restore'; id: string; checklistId: string; at: number; item: TodoItem }
	| { op: 'move'; id: string; day: string; newId?: string; item: TodoItem }
	| { op: 'moveMany'; ids: string[]; newIds: (string | null)[]; day: string; items: TodoItem[] }
	| { op: 'reorder'; checklistId: string; ids: string[] }
	| { op: 'createChecklist'; noteId: string; id: string };

/** Segna un ricorrente creato o reso tale sul dispositivo, prima che il server dia la regola. */
export const LOCAL_RULE = 'local';

/**
 * Un'occorrenza di un ricorrente spostata diventa un todo nuovo con un altro id: il client lo
 * sceglie prima (così le operazioni successive, anche offline, lo conoscono già).
 */
export const isRecurring = (item: Pick<TodoItem, 'ruleId' | 'repeat'>) =>
	!!(item.ruleId || item.repeat);

/** Il todo come compare nel giorno di arrivo dopo uno spostamento. */
function moved(item: TodoItem, newId: string | null | undefined): TodoItem {
	return newId
		? { ...item, id: newId, done: false, ruleId: null, repeat: null }
		: { ...item, done: false };
}

/**
 * Applica le operazioni in coda ai todo di una lista. `day` è il giorno della lista del giorno
 * (null per le checklist delle note). Applicare due volte la stessa operazione non cambia nulla:
 * i dati possono già contenerla, se il server l'ha ricevuta ma la risposta non è ancora arrivata.
 */
export function applyTodoOps(
	items: TodoItem[],
	ops: TodoOp[],
	list: { checklistId: string; day: string | null }
): TodoItem[] {
	let rows = items.map((i) => ({ ...i }));
	const find = (id: string) => rows.find((r) => r.id === id);
	const remove = (id: string) => (rows = rows.filter((r) => r.id !== id));
	const add = (item: TodoItem, at = rows.length) => {
		if (!find(item.id)) rows.splice(Math.min(at, rows.length), 0, { ...item });
	};
	/** Spostamento: esce dalla lista, o ci entra se è quella del giorno di arrivo. */
	const move = (id: string, day: string, item: TodoItem | undefined, newId?: string | null) => {
		if (list.day !== day || !item) return remove(id);
		const target = moved(item, newId);
		// già arrivato (operazione applicata due volte): resta dov'è
		if (target.id !== id) remove(id);
		add(target);
	};

	for (const op of ops) {
		switch (op.op) {
			case 'create': {
				const here = op.checklistId
					? op.checklistId === list.checklistId
					: list.day !== null && op.day === list.day;
				if (here)
					op.ids.forEach((id, i) =>
						add({
							id,
							text: op.texts[i],
							done: false,
							ruleId: op.repeat ? LOCAL_RULE : null,
							repeat: op.repeat,
							time: op.time
						})
					);
				break;
			}
			case 'toggle':
			case 'text':
			case 'time': {
				const row = find(op.id);
				if (!row) break;
				if (op.op === 'toggle') row.done = op.done;
				else if (op.op === 'text') row.text = op.text;
				else row.time = op.time;
				break;
			}
			case 'repeat': {
				const row = find(op.id);
				if (row) {
					row.repeat = op.repeat;
					if (op.repeat && !row.ruleId) row.ruleId = LOCAL_RULE;
				}
				break;
			}
			case 'delete':
				remove(op.id);
				break;
			case 'restore':
				if (op.checklistId === list.checklistId) add(op.item, op.at);
				break;
			case 'move':
				move(op.id, op.day, op.item, op.newId);
				break;
			case 'moveMany':
				op.ids.forEach((id, i) => move(id, op.day, op.items[i], op.newIds[i]));
				break;
			case 'reorder': {
				if (op.checklistId !== list.checklistId) break;
				// come sul server: quelli che mancano restano dopo, nel loro ordine
				const rank = new Map(op.ids.map((id, i) => [id, i]));
				rows = rows
					.map((r, i) => ({ r, k: rank.get(r.id) ?? op.ids.length + i }))
					.sort((a, b) => a.k - b.k)
					.map((x) => x.r);
				break;
			}
		}
	}
	return rows;
}

/** Todo in sospeso già portati via (spostati, eliminati o fatti) da operazioni in coda. */
export function handledTodoIds(ops: TodoOp[]) {
	const ids = new Set<string>();
	for (const op of ops) {
		if (op.op === 'move' || op.op === 'delete') ids.add(op.id);
		else if (op.op === 'moveMany') op.ids.forEach((id) => ids.add(id));
		else if (op.op === 'toggle' && op.done) ids.add(op.id);
	}
	return ids;
}

/**
 * Stesso valore JSON, senza badare all'ordine delle chiavi (Postgres riordina quelle di jsonb).
 * Serve a capire se un "conflitto" è solo la nostra modifica già salvata, con la risposta persa.
 */
export function sameJson(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a)) {
		const other = b as unknown[];
		return a.length === other.length && a.every((v, i) => sameJson(v, other[i]));
	}
	const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
	const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
	return (
		ka.length === kb.length &&
		ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
	);
}

/** Le modifiche della patch ci sono già tutte nella versione del server. */
export const patchApplied = (patch: Record<string, unknown>, current: Record<string, unknown>) =>
	Object.entries(patch).every(([key, value]) => sameJson(value, current[key]));
