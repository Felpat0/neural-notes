// Liste e todo: la lista del giorno (creata da sola), le occorrenze dei ricorrenti, i promemoria.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, schema as s } from './db/index.ts';
import type { User } from './auth.ts';
import { timeIn, zonedDateTime } from '#lib/format.ts';
import { repeatsOn, type Repeat } from '#lib/repeat.ts';
import type { TodoItem } from '#lib/todo-api.ts';

export { MAX_TODO_LENGTH, type TodoItem } from '#lib/todo-api.ts';

/** La lista del giorno: esiste sempre, la si crea al primo bisogno. */
export async function dayChecklistId(userId: string, day: string) {
	const find = () =>
		db
			.select({ id: s.checklist.id })
			.from(s.checklist)
			.where(
				and(eq(s.checklist.userId, userId), eq(s.checklist.kind, 'day'), eq(s.checklist.day, day))
			);
	const [existing] = await find();
	if (existing) return existing.id;
	await db
		.insert(s.checklist)
		.values({ id: randomUUID(), userId, kind: 'day', day })
		.onConflictDoNothing();
	// in caso di due richieste insieme vince la prima: si rilegge
	const [row] = await find();
	return row.id;
}

/** Crea le occorrenze dei todo ricorrenti che valgono per quel giorno e non ci sono ancora. */
async function materializeRules(user: User, day: string, checklistId: string) {
	const rules = await db
		.select()
		.from(s.todoRule)
		.where(
			and(
				eq(s.todoRule.userId, user.id),
				lte(s.todoRule.startsOn, day),
				or(isNull(s.todoRule.endsOn), gte(s.todoRule.endsOn, day))
			)
		);
	const due = rules.filter((r) => repeatsOn(r.repeat, day));
	if (!due.length) return;
	// ultime della lista, nell'ordine di creazione delle regole
	const inserted = await db
		.insert(s.todo)
		.values(due.map((r) => ({ id: randomUUID(), checklistId, text: r.text, ruleId: r.id })))
		.onConflictDoNothing()
		.returning({ id: s.todo.id, ruleId: s.todo.ruleId, text: s.todo.text });
	const reminders = inserted.flatMap((t) => {
		const rule = due.find((r) => r.id === t.ruleId);
		return rule?.remindTime
			? [
					{
						id: randomUUID(),
						userId: user.id,
						todoId: t.id,
						todoRuleId: rule.id,
						fireAt: zonedDateTime(day, rule.remindTime.slice(0, 5), user.timezone),
						title: t.text
					}
				]
			: [];
	});
	if (reminders.length) await db.insert(s.reminder).values(reminders);
}

async function itemsOf(user: User, checklistIds: string[], todoIds?: string[]) {
	const rows = await db
		.select({
			id: s.todo.id,
			checklistId: s.todo.checklistId,
			text: s.todo.text,
			doneAt: s.todo.doneAt,
			ruleId: s.todo.ruleId,
			repeat: s.todoRule.repeat,
			ruleEndsOn: s.todoRule.endsOn,
			fireAt: sql<Date | null>`(select min(${s.reminder.fireAt}) from ${s.reminder} where ${s.reminder.todoId} = ${s.todo.id})`
		})
		.from(s.todo)
		.leftJoin(s.todoRule, eq(s.todo.ruleId, s.todoRule.id))
		.where(
			and(
				inArray(s.todo.checklistId, checklistIds),
				isNull(s.todo.deletedAt),
				todoIds ? inArray(s.todo.id, todoIds) : undefined
			)
		)
		.orderBy(asc(s.todo.position), asc(s.todo.createdAt));
	return rows.map((r) => ({
		checklistId: r.checklistId,
		item: {
			id: r.id,
			text: r.text,
			done: !!r.doneAt,
			ruleId: r.ruleId,
			// una regola interrotta non mostra più il simbolo della ripetizione
			repeat: r.ruleEndsOn ? null : (r.repeat ?? null),
			time: r.fireAt ? timeIn(r.fireAt, user.timezone) : null
		} satisfies TodoItem
	}));
}

/** I todo della lista del giorno (con le occorrenze dei ricorrenti). */
export async function dayTodos(user: User, day: string) {
	const checklistId = await dayChecklistId(user.id, day);
	await materializeRules(user, day, checklistId);
	return { checklistId, items: (await itemsOf(user, [checklistId])).map((r) => r.item) };
}

async function todoItem(user: User, id: string) {
	const [row] = await itemsOf(user, await userChecklistIdsOf(user.id, [id]), [id]);
	return row?.item ?? null;
}

/** Todo dell'utente con la sua lista (null se non è suo). */
async function ownTodo(userId: string, id: string) {
	const [row] = await db
		.select({ todo: s.todo, checklist: s.checklist })
		.from(s.todo)
		.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
		.where(and(eq(s.todo.id, id), eq(s.checklist.userId, userId)));
	return row ?? null;
}

async function userChecklistIdsOf(userId: string, todoIds: string[]) {
	const rows = await db
		.select({ id: s.checklist.id })
		.from(s.todo)
		.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
		.where(and(inArray(s.todo.id, todoIds), eq(s.checklist.userId, userId)));
	return [...new Set(rows.map((r) => r.id))];
}

/** Giorno a cui appartiene una lista (per le liste delle note: oggi). */
async function checklistDay(checklistId: string, fallback: string) {
	const [row] = await db
		.select({ day: s.checklist.day })
		.from(s.checklist)
		.where(eq(s.checklist.id, checklistId));
	return row?.day ?? fallback;
}

async function ownChecklist(userId: string, checklistId: string) {
	const [row] = await db
		.select({ id: s.checklist.id })
		.from(s.checklist)
		.where(and(eq(s.checklist.id, checklistId), eq(s.checklist.userId, userId)));
	return !!row;
}

async function setReminder(
	user: User,
	todoId: string,
	title: string,
	day: string,
	time: string | null
) {
	await db.delete(s.reminder).where(and(eq(s.reminder.todoId, todoId), isNull(s.reminder.sentAt)));
	if (time)
		await db.insert(s.reminder).values({
			id: randomUUID(),
			userId: user.id,
			todoId,
			fireAt: zonedDateTime(day, time, user.timezone),
			title
		});
}

// --- Operazioni (chiamate da /api/todo) ---

export async function createTodos(
	user: User,
	input: {
		day?: string;
		checklistId?: string;
		texts: string[];
		/** id scelti dal client, uno per testo: ripetere la richiesta non crea doppioni */
		ids?: string[];
		time?: string | null;
		repeat?: Repeat | null;
	},
	today: string
) {
	let checklistId: string;
	let day: string;
	if (input.checklistId) {
		if (!(await ownChecklist(user.id, input.checklistId))) return null;
		checklistId = input.checklistId;
		day = await checklistDay(checklistId, today);
	} else {
		day = input.day ?? today;
		checklistId = await dayChecklistId(user.id, day);
	}

	// richiesta ripetuta (risposta persa per strada): i todo che esistono già non si ricreano
	const existing = new Set(
		input.ids?.length
			? (await db.select({ id: s.todo.id }).from(s.todo).where(inArray(s.todo.id, input.ids))).map(
					(r) => r.id
				)
			: []
	);
	const ids: string[] = [];
	for (const [i, text] of input.texts.entries()) {
		const id = input.ids?.[i] ?? randomUUID();
		ids.push(id);
		if (existing.has(id)) continue;
		let ruleId: string | null = null;
		if (input.repeat) {
			ruleId = randomUUID();
			await db.insert(s.todoRule).values({
				id: ruleId,
				userId: user.id,
				text,
				repeat: input.repeat,
				startsOn: day,
				remindTime: input.time ?? null
			});
		}
		await db.insert(s.todo).values({ id, checklistId, text, ruleId });
		if (input.time) await setReminder(user, id, text, day, input.time);
	}
	const items = await itemsOf(user, [checklistId], ids);
	return { day, checklistId, items: items.map((r) => r.item) };
}

export async function updateTodoText(user: User, id: string, text: string) {
	const own = await ownTodo(user.id, id);
	if (!own) return null;
	await db.update(s.todo).set({ text }).where(eq(s.todo.id, id));
	// il testo di un ricorrente vale anche per le prossime occorrenze
	if (own.todo.ruleId)
		await db.update(s.todoRule).set({ text }).where(eq(s.todoRule.id, own.todo.ruleId));
	await db
		.update(s.reminder)
		.set({ title: text })
		.where(and(eq(s.reminder.todoId, id), isNull(s.reminder.sentAt)));
	return todoItem(user, id);
}

export async function toggleTodo(user: User, id: string, done: boolean) {
	if (!(await ownTodo(user.id, id))) return null;
	await db
		.update(s.todo)
		.set({ doneAt: done ? new Date() : null })
		.where(eq(s.todo.id, id));
	return todoItem(user, id);
}

/**
 * Sposta in un altro giorno (in fondo alla lista). Un'occorrenza di un ricorrente diventa un todo
 * normale nel giorno nuovo (con `newId`, se il client l'ha scelto); al suo posto resta un
 * segnaposto eliminato, perché non venga ricreata.
 */
export async function moveTodo(user: User, id: string, day: string, newId?: string) {
	const own = await ownTodo(user.id, id);
	if (!own) return null;
	// richiesta ripetuta: l'occorrenza è già stata spostata con l'id scelto dal client
	if (own.todo.ruleId && newId && newId !== id && (await ownTodo(user.id, newId)))
		return { day, item: await todoItem(user, newId) };
	const target = await dayChecklistId(user.id, day);
	const [reminder] = await db
		.select({ fireAt: s.reminder.fireAt })
		.from(s.reminder)
		.where(and(eq(s.reminder.todoId, id), isNull(s.reminder.sentAt)));
	const time = reminder ? timeIn(reminder.fireAt, user.timezone) : null;

	let movedId = id;
	if (own.todo.ruleId) {
		movedId = newId && newId !== id ? newId : randomUUID();
		await db.insert(s.todo).values({ id: movedId, checklistId: target, text: own.todo.text });
		await db.update(s.todo).set({ deletedAt: new Date() }).where(eq(s.todo.id, id));
		await db.delete(s.reminder).where(and(eq(s.reminder.todoId, id), isNull(s.reminder.sentAt)));
	} else {
		await db
			.update(s.todo)
			.set({
				checklistId: target,
				doneAt: null,
				position: sql`(extract(epoch from clock_timestamp()) * 1000000)::bigint`
			})
			.where(eq(s.todo.id, id));
	}
	// il promemoria segue il todo, alla stessa ora
	if (time) await setReminder(user, movedId, own.todo.text, day, time);
	return { day, item: await todoItem(user, movedId) };
}

/** Nuovo ordine di una lista (gli id che mancano restano dopo). */
export async function reorderTodos(user: User, checklistId: string, ids: string[]) {
	if (!(await ownChecklist(user.id, checklistId))) return false;
	// liste corte: un aggiornamento per todo, solo quelli di questa lista
	for (const [i, id] of ids.entries())
		await db
			.update(s.todo)
			.set({ position: (i + 1) * 1000 })
			.where(and(eq(s.todo.id, id), eq(s.todo.checklistId, checklistId)));
	return true;
}

export async function deleteTodo(user: User, id: string) {
	if (!(await ownTodo(user.id, id))) return false;
	await db.update(s.todo).set({ deletedAt: new Date() }).where(eq(s.todo.id, id));
	return true;
}

export async function restoreTodo(user: User, id: string) {
	if (!(await ownTodo(user.id, id))) return null;
	await db.update(s.todo).set({ deletedAt: null }).where(eq(s.todo.id, id));
	return todoItem(user, id);
}

/**
 * Ripetizione di un todo. Con una regola: crea o cambia la regola a partire da quel giorno.
 * Con null: la regola si ferma a quel giorno (questa occorrenza resta, le prossime no).
 */
export async function setTodoRepeat(user: User, id: string, repeat: Repeat | null, today: string) {
	const own = await ownTodo(user.id, id);
	if (!own) return null;
	const day = own.checklist.day ?? today;
	if (repeat) {
		if (own.todo.ruleId)
			await db
				.update(s.todoRule)
				.set({ repeat, endsOn: null })
				.where(eq(s.todoRule.id, own.todo.ruleId));
		else {
			const ruleId = randomUUID();
			const time = (await todoItem(user, id))?.time ?? null;
			await db.insert(s.todoRule).values({
				id: ruleId,
				userId: user.id,
				text: own.todo.text,
				repeat,
				startsOn: day,
				remindTime: time
			});
			await db.update(s.todo).set({ ruleId }).where(eq(s.todo.id, id));
		}
	} else if (own.todo.ruleId) {
		await db.update(s.todoRule).set({ endsOn: day }).where(eq(s.todoRule.id, own.todo.ruleId));
	}
	return todoItem(user, id);
}

/** Ora del promemoria (null = nessun promemoria); per un ricorrente vale anche per le prossime. */
export async function setTodoTime(user: User, id: string, time: string | null, today: string) {
	const own = await ownTodo(user.id, id);
	if (!own) return null;
	await setReminder(user, id, own.todo.text, own.checklist.day ?? today, time);
	if (own.todo.ruleId)
		await db.update(s.todoRule).set({ remindTime: time }).where(eq(s.todoRule.id, own.todo.ruleId));
	return todoItem(user, id);
}

/** Todo ricorrenti attivi o futuri, per la pagina Ricorrenti. */
export async function listRules(userId: string, today: string) {
	return db
		.select()
		.from(s.todoRule)
		.where(
			and(
				eq(s.todoRule.userId, userId),
				or(isNull(s.todoRule.endsOn), gte(s.todoRule.endsOn, today))
			)
		)
		.orderBy(asc(s.todoRule.text));
}

/** Interrompe una regola: niente occorrenze da domani in poi (quella di oggi resta). */
export async function stopRule(userId: string, ruleId: string, today: string) {
	await db
		.update(s.todoRule)
		.set({ endsOn: today })
		.where(and(eq(s.todoRule.id, ruleId), eq(s.todoRule.userId, userId)));
}

// --- Checklist delle note, todo in sospeso, giorni con contenuti ---

/** Todo di più liste (dell'utente), raggruppati per lista. */
export async function checklistItems(user: User, checklistIds: string[]) {
	const map = new Map<string, TodoItem[]>(checklistIds.map((id) => [id, []]));
	if (!checklistIds.length) return map;
	const owned = await db
		.select({ id: s.checklist.id })
		.from(s.checklist)
		.where(and(inArray(s.checklist.id, checklistIds), eq(s.checklist.userId, user.id)));
	if (!owned.length) return map;
	for (const { checklistId, item } of await itemsOf(
		user,
		owned.map((c) => c.id)
	))
		map.get(checklistId)?.push(item);
	return map;
}

/** Nuova checklist dentro una nota (null se la nota non è dell'utente). */
export async function createNoteChecklist(user: User, noteId: string, wantedId?: string) {
	const [note] = await db
		.select({ id: s.note.id })
		.from(s.note)
		.where(and(eq(s.note.id, noteId), eq(s.note.userId, user.id), isNull(s.note.deletedAt)));
	if (!note) return null;
	const id = wantedId ?? randomUUID();
	await db
		.insert(s.checklist)
		.values({ id, userId: user.id, kind: 'note', noteId })
		.onConflictDoNothing();
	// con un id del client che esiste già va bene solo se è la sua (richiesta ripetuta)
	return wantedId && !(await ownChecklist(user.id, id)) ? null : id;
}

/**
 * Todo non fatti dei giorni passati (ultimi 30 giorni), dal più vecchio. Senza quelli nati dagli
 * eventi di Google Calendar: un evento passato non resta da fare.
 */
export async function overdueTodos(user: User, today: string, since: string) {
	const rows = await db
		.select({ id: s.todo.id, text: s.todo.text, ruleId: s.todo.ruleId, day: s.checklist.day })
		.from(s.todo)
		.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
		.where(
			and(
				eq(s.checklist.userId, user.id),
				eq(s.checklist.kind, 'day'),
				sql`${s.checklist.day} < ${today}`,
				gte(s.checklist.day, since),
				isNull(s.todo.doneAt),
				isNull(s.todo.deletedAt),
				sql`not exists (select 1 from ${s.googleImport} where ${s.googleImport.todoId} = ${s.todo.id})`
			)
		)
		.orderBy(asc(s.checklist.day), asc(s.todo.position));
	return rows.map((r) => ({ id: r.id, text: r.text, ruleId: r.ruleId, day: r.day! }));
}

/** Giorni (tra `from` e `to`) con todo da fare o note assegnate, per i segni sul calendario. */
export async function dayMarkers(userId: string, from: string, to: string) {
	const todos = await db
		.select({ day: s.checklist.day, n: sql<number>`count(*)::int` })
		.from(s.todo)
		.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
		.where(
			and(
				eq(s.checklist.userId, userId),
				eq(s.checklist.kind, 'day'),
				gte(s.checklist.day, from),
				lte(s.checklist.day, to),
				isNull(s.todo.doneAt),
				isNull(s.todo.deletedAt)
			)
		)
		.groupBy(s.checklist.day);
	const notes = await db
		.select({ day: s.note.day, n: sql<number>`count(*)::int` })
		.from(s.note)
		.where(
			and(
				eq(s.note.userId, userId),
				gte(s.note.day, from),
				lte(s.note.day, to),
				isNull(s.note.deletedAt)
			)
		)
		.groupBy(s.note.day);
	const markers: Record<string, { todos: number; notes: number }> = {};
	for (const r of todos) markers[r.day!] = { todos: r.n, notes: 0 };
	for (const r of notes) markers[r.day!] = { todos: markers[r.day!]?.todos ?? 0, notes: r.n };
	return markers;
}
