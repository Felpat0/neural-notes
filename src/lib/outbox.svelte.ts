// Coda delle modifiche, per usare l'app anche senza rete.
// Ogni modifica (todo, note, promemoria) si salva prima in IndexedDB e poi parte verso il server,
// una alla volta e nell'ordine in cui è stata fatta. Senza rete resta in coda e riparte da sola
// quando la connessione torna (evento "online", app riaperta, nuovi tentativi a intervalli).
// Gli oggetti nuovi hanno l'id scelto qui (newId), così le operazioni successive li conoscono già.
import { browser } from '$app/env';
import { invalidate, invalidateAll } from '$app/navigation';
import { patchApplied, type TodoOp } from '#lib/outbox-ops.ts';
import type { TodoItem } from '#lib/todo-api.ts';

export type NotePatch = Partial<{
	title: string;
	content: unknown;
	text: string;
	day: string | null;
	tags: string[];
	pinned: boolean;
}>;
/** Versione della nota sul server, quando è cambiata altrove (conflitto). */
export type NoteVersion = {
	title: string;
	content: unknown;
	text: string;
	day: string | null;
	tags: string[];
	pinned: boolean;
	updatedAt: string;
};

type Common = { key: string; seq: number; user: string; attempts?: number };
export type Entry = Common &
	(
		| { kind: 'todo'; body: TodoOp }
		| { kind: 'createNote'; noteId: string; day: string | null }
		| {
				kind: 'note';
				noteId: string;
				/** modifiche unite in una sola richiesta, rispetto alla versione `base` */
				patch: NotePatch;
				base: string | null;
				force?: boolean;
				/** cresce a ogni modifica: dice se è cambiata mentre si inviava */
				rev: number;
				conflict?: NoteVersion;
				error?: string;
		  }
		| { kind: 'reminder'; noteId: string; at: string | null }
		| { kind: 'deleteNote'; noteId: string }
	);
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewEntry = DistOmit<Entry, keyof Common>;

export type Outcome =
	| { ok: true; data: Record<string, unknown> | null }
	| { ok: false; status: number; message: string };

/** Modifiche di una nota salvate: la nuova versione di riferimento per le prossime. */
export type NoteSaved = { noteId: string; updatedAt: string; tags?: string[] };

/** Id nuovo (UUID v4). Niente crypto.randomUUID: non c'è su http da un altro dispositivo della rete. */
export function newId() {
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- IndexedDB: "outbox" (la coda) e "kv" (copie locali, es. le checklist delle note) ---

function request<T>(req: IDBRequest<T>) {
	return new Promise<T>((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function openDb() {
	const req = indexedDB.open('neural-notes', 1);
	req.onupgradeneeded = () => {
		req.result.createObjectStore('outbox', { keyPath: 'key' });
		req.result.createObjectStore('kv');
	};
	return request(req);
}

const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000];
const MAX_ATTEMPTS = 5;
const TIMEOUT = 20_000;

class Outbox {
	/** modifiche dell'utente ancora da inviare, in ordine */
	entries = $state.raw<Entry[]>([]);
	/** false dopo un invio fallito per mancanza di rete, finché uno non riesce */
	online = $state(true);
	/** sessione scaduta: le modifiche restano in coda finché non si rientra */
	authError = $state(false);
	notices = $state.raw<{ id: number; message: string }[]>([]);

	#db: IDBDatabase | null = null;
	#opening: Promise<void> | null = null;
	#user: string | null = null;
	#seq = 0;
	#running = false;
	#again = false;
	#retry: ReturnType<typeof setTimeout> | undefined;
	#failures = 0;
	/** i dati mostrati possono essere quelli della cache: da ricaricare quando torna la rete */
	#stale = false;
	#started = false;
	#waiters = new Map<string, (outcome: Outcome) => void>();
	#listeners = new Set<(event: NoteSaved) => void>();
	#sentListeners = new Set<() => void>();
	#notesTimer: ReturnType<typeof setTimeout> | undefined;

	/** Carica la coda dell'utente (chiamata dal load del layout, prima di mostrare le pagine). */
	async init(user: string | null) {
		if (!browser) return;
		this.#opening ??= openDb()
			.then((db) => void (this.#db = db))
			.catch(() => undefined); // senza IndexedDB (navigazione privata): coda solo in memoria
		await this.#opening;
		this.#start();
		if (user !== this.#user) {
			this.#user = user;
			const all = this.#db
				? await request(this.#db.transaction('outbox').objectStore('outbox').getAll())
				: [];
			this.entries = (all as Entry[]).filter((e) => e.user === user).sort((a, b) => a.seq - b.seq);
			this.#seq = Math.max(0, ...all.map((e: Entry) => e.seq));
		}
		this.authError = false;
		if (user) void this.flush();
	}

	// --- Lettura (reattiva) ---

	/** Coda vuota e nessun invio in corso: i dati del server comprendono tutte le modifiche. */
	get idle() {
		return !this.#running && !this.entries.length;
	}

	get todoOps(): TodoOp[] {
		return this.entries.flatMap((e) => (e.kind === 'todo' ? [e.body] : []));
	}
	note(noteId: string) {
		return this.entries.find(
			(e): e is Extract<Entry, { kind: 'note' }> => e.kind === 'note' && e.noteId === noteId
		);
	}
	reminder(noteId: string) {
		return this.entries.find(
			(e): e is Extract<Entry, { kind: 'reminder' }> => e.kind === 'reminder' && e.noteId === noteId
		);
	}
	isDraft(noteId: string) {
		return this.entries.some((e) => e.kind === 'createNote' && e.noteId === noteId);
	}
	isDeleted(noteId: string) {
		return this.entries.some((e) => e.kind === 'deleteNote' && e.noteId === noteId);
	}
	/** Note create sul dispositivo e non ancora sul server (con il titolo, se c'è già). */
	get drafts() {
		return this.entries.flatMap((e) =>
			e.kind === 'createNote' && !this.isDeleted(e.noteId)
				? [{ id: e.noteId, day: e.day, title: this.note(e.noteId)?.patch.title ?? '' }]
				: []
		);
	}

	// --- Scrittura ---

	/** Operazione su todo e checklist: l'esito arriva quando il server l'ha ricevuta. */
	todo(body: TodoOp) {
		return this.#add({ kind: 'todo', body }, `t:${this.#nextSeq()}:${newId()}`);
	}
	createNote(noteId: string, day: string | null) {
		return this.#add({ kind: 'createNote', noteId, day }, `c:${noteId}`);
	}
	deleteNote(noteId: string) {
		return this.#add({ kind: 'deleteNote', noteId }, `d:${noteId}`);
	}

	/** Promemoria di una nota: vale l'ultimo. */
	setReminder(noteId: string, at: string | null) {
		const old = this.reminder(noteId);
		this.#put(old ? { ...old, at } : this.#entry({ kind: 'reminder', noteId, at }, `r:${noteId}`));
		void this.flush();
	}

	/** Modifiche di una nota: si uniscono a quelle ancora in coda (una richiesta sola). */
	saveNote(noteId: string, patch: NotePatch, base: string | null) {
		const old = this.note(noteId);
		this.#put(
			old
				? { ...old, patch: { ...old.patch, ...patch }, rev: old.rev + 1 }
				: this.#entry({ kind: 'note', noteId, patch, base, rev: 1 }, `n:${noteId}`)
		);
		void this.flush();
	}

	/** Conflitto: "tieni la mia" (sovrascrive con `full`) o "carica l'altra" (scarta la coda). */
	resolveConflict(noteId: string, keep: NotePatch | null) {
		const old = this.note(noteId);
		if (!old) return;
		if (!keep) return this.#delete(old.key);
		this.#put({
			...old,
			patch: keep,
			base: old.conflict?.updatedAt ?? old.base,
			force: true,
			conflict: undefined,
			error: undefined,
			rev: old.rev + 1
		});
		void this.flush();
	}

	/** "Riprova" dopo un errore del server su una nota. */
	retryNote(noteId: string) {
		const old = this.note(noteId);
		if (old?.error) this.#put({ ...old, error: undefined, attempts: 0 });
		void this.flush();
	}

	/** Avviso quando le modifiche di una nota arrivano al server. */
	onNoteSaved(listener: (event: NoteSaved) => void) {
		this.#listeners.add(listener);
		return () => void this.#listeners.delete(listener);
	}

	/** Avviso dopo un giro di invii riuscito (le modifiche di questo dispositivo sono sul server). */
	onSent(listener: () => void) {
		this.#sentListeners.add(listener);
		return () => void this.#sentListeners.delete(listener);
	}

	notify(message: string) {
		const id = Date.now() + Math.random();
		this.notices = [...this.notices, { id, message }];
		setTimeout(() => (this.notices = this.notices.filter((n) => n.id !== id)), 6000);
	}

	// --- Copie locali delle checklist delle note (si caricano a parte, non dalla pagina) ---

	async saveChecklist(id: string, items: TodoItem[]) {
		if (!this.#db) return;
		const tx = this.#db.transaction('kv', 'readwrite');
		tx.objectStore('kv').put({ user: this.#user, items }, `checklist:${id}`);
	}

	async cachedChecklist(id: string): Promise<TodoItem[] | null> {
		if (!this.#db) return null;
		const store = this.#db.transaction('kv').objectStore('kv');
		const hit = (await request(store.get(`checklist:${id}`))) as
			{ user: string; items: TodoItem[] } | undefined;
		return hit?.user === this.#user ? hit.items : null;
	}

	// --- Invio ---

	/** Invia la coda in ordine; si ferma al primo errore di rete e ritenta più tardi. */
	async flush() {
		if (!browser || !this.#user) return;
		if (this.#running) {
			this.#again = true;
			return;
		}
		this.#running = true;
		clearTimeout(this.#retry);
		let rejected = false;
		let sent = false;
		try {
			do {
				this.#again = false;
				for (;;) {
					// le note in conflitto o rifiutate aspettano chi le apre
					const entry = this.entries.find((e) => e.kind !== 'note' || (!e.conflict && !e.error));
					if (!entry) break;
					if (!navigator.onLine) {
						this.#offline();
						return;
					}
					let res: Response;
					try {
						res = await this.#send(entry);
					} catch {
						this.#offline();
						return;
					}
					this.online = true;
					this.#failures = 0;
					sent = true;
					const outcome = await this.#handle(entry, res);
					if (outcome === 'stop') return;
					if (outcome === 'rejected') rejected = true;
				}
			} while (this.#again);
			// dati forse vecchi (dalla cache, o con modifiche rifiutate): si ricaricano dal server,
			// ma solo dopo un invio riuscito (senza rete la pagina diventerebbe un errore)
			if (rejected || (this.#stale && sent)) {
				this.#stale = false;
				await invalidateAll();
			}
		} finally {
			this.#running = false;
			if (sent) for (const listener of this.#sentListeners) listener();
		}
	}

	#start() {
		if (this.#started) return;
		this.#started = true;
		this.online = navigator.onLine;
		addEventListener('online', () => void this.flush());
		addEventListener('offline', () => {
			this.online = false;
			this.#stale = true;
		});
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.flush();
		});
	}

	#offline() {
		this.online = false;
		this.#stale = true;
		const delay = RETRY_DELAYS[Math.min(this.#failures++, RETRY_DELAYS.length - 1)];
		clearTimeout(this.#retry);
		this.#retry = setTimeout(() => void this.flush(), delay);
	}

	#send(entry: Entry) {
		const call = (url: string, method: string, body?: unknown) => {
			const abort = new AbortController();
			const timer = setTimeout(() => abort.abort(), TIMEOUT);
			return fetch(url, {
				method,
				headers: body === undefined ? undefined : { 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: abort.signal
			}).finally(() => clearTimeout(timer));
		};
		switch (entry.kind) {
			case 'todo':
				return call('/api/todo', 'POST', entry.body);
			case 'createNote':
				return call('/api/notes', 'POST', { id: entry.noteId, day: entry.day });
			case 'note':
				return call(`/api/notes/${entry.noteId}`, 'PATCH', {
					...entry.patch,
					base: entry.base,
					force: entry.force ?? false
				});
			case 'reminder':
				return call(`/api/notes/${entry.noteId}/reminder`, 'PUT', { at: entry.at });
			case 'deleteNote':
				return call(`/api/notes/${entry.noteId}`, 'DELETE');
		}
	}

	async #handle(entry: Entry, res: Response): Promise<'ok' | 'rejected' | 'stop'> {
		const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
		// la voce può essere cambiata mentre la richiesta era in viaggio (altre modifiche alla nota)
		const now = this.entries.find((e) => e.key === entry.key);
		// tolta nel frattempo (es. "carica l'altra" in un conflitto): non c'è altro da fare
		if (!now) {
			this.#settle(
				entry.key,
				res.ok ? { ok: true, data } : { ok: false, status: res.status, message: '' }
			);
			return 'ok';
		}

		if (res.ok) {
			this.#done(entry, now, data);
			return 'ok';
		}
		if (res.status === 401) {
			this.authError = true;
			return 'stop';
		}
		if (entry.kind === 'note' && res.status === 409 && now.kind === 'note') {
			const current = data?.conflict as NoteVersion | undefined;
			// la nostra modifica era già arrivata (risposta persa): non è un vero conflitto
			if (current && patchApplied(entry.patch, current)) {
				this.#done(entry, now, { updatedAt: current.updatedAt });
				return 'ok';
			}
			this.#put({ ...now, conflict: current });
			return 'ok';
		}
		const message = String(data?.message ?? `errore ${res.status}`);
		// server non disponibile: si ritenta più tardi, poi si rinuncia
		if (res.status >= 500 || res.status === 408 || res.status === 429) {
			const attempts = (entry.attempts ?? 0) + 1;
			if (attempts < MAX_ATTEMPTS) {
				this.#put({ ...now, attempts });
				this.#offline();
				return 'stop';
			}
		}
		// rifiutata: le note restano in coda (non si perde il testo), il resto si scarta
		if (entry.kind === 'note' && res.status !== 404 && now.kind === 'note') {
			this.#put({ ...now, error: message });
		} else {
			this.#delete(entry.key);
			this.#settle(entry.key, { ok: false, status: res.status, message });
		}
		if (res.status !== 404 || entry.kind !== 'note')
			this.notify(`Modifica non salvata: ${message}`);
		return 'rejected';
	}

	#done(entry: Entry, now: Entry, data: Record<string, unknown> | null) {
		if (entry.kind === 'note' && now.kind === 'note') {
			const updatedAt = String(data?.updatedAt);
			// altre modifiche arrivate nel frattempo: restano, rispetto alla versione appena salvata
			if (now.rev !== entry.rev)
				this.#put({ ...now, base: updatedAt, force: false, conflict: undefined, attempts: 0 });
			else this.#delete(entry.key);
			this.#emit({
				noteId: entry.noteId,
				updatedAt,
				tags: data?.tags as string[] | undefined
			});
			// l'elenco (titolo, anteprima, gruppi) si aggiorna poco dopo
			clearTimeout(this.#notesTimer);
			this.#notesTimer = setTimeout(() => void invalidate('app:notes'), 1500);
			return;
		}
		// promemoria cambiato di nuovo nel frattempo: resta da inviare il valore nuovo
		if (entry.kind === 'reminder' && now.kind === 'reminder' && now.at !== entry.at) return;
		this.#delete(entry.key);
		// nota eliminata: quello che restava da inviare per lei non serve più
		if (entry.kind === 'deleteNote')
			for (const e of this.entries)
				if ((e.kind === 'note' || e.kind === 'reminder') && e.noteId === entry.noteId)
					this.#delete(e.key);
		this.#settle(entry.key, { ok: true, data });
	}

	#settle(key: string, outcome: Outcome) {
		this.#waiters.get(key)?.(outcome);
		this.#waiters.delete(key);
	}

	#emit(event: NoteSaved) {
		for (const listener of this.#listeners) listener(event);
	}

	#nextSeq() {
		this.#seq = Math.max(this.#seq + 1, Date.now());
		return this.#seq;
	}

	#entry(data: NewEntry, key: string): Entry {
		return { ...data, key, seq: this.#nextSeq(), user: this.#user ?? '' } as Entry;
	}

	#add(data: NewEntry, key: string) {
		const outcome = new Promise<Outcome>((resolve) => this.#waiters.set(key, resolve));
		this.#put(this.#entry(data, key));
		void this.flush();
		return outcome;
	}

	#put(entry: Entry) {
		const at = this.entries.findIndex((e) => e.key === entry.key);
		this.entries =
			at >= 0
				? this.entries.map((e, i) => (i === at ? entry : e))
				: [...this.entries, entry].sort((a, b) => a.seq - b.seq);
		this.#db?.transaction('outbox', 'readwrite').objectStore('outbox').put(entry);
	}

	#delete(key: string) {
		this.entries = this.entries.filter((e) => e.key !== key);
		this.#db?.transaction('outbox', 'readwrite').objectStore('outbox').delete(key);
	}
}

export const outbox = new Outbox();
