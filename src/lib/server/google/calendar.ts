// Google Calendar nei due sensi: todo e note nel calendario dell'app (coda google_outbox), modifiche
// fatte in Google riportate nell'app, eventi dei calendari scelti trasformati in todo.
import { createHash, randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	notInArray,
	or,
	sql
} from 'drizzle-orm';
import { PUBLIC_APP_URL } from '$app/env/public';
import { db, schema as s } from '../db/index.ts';
import { getUser, toUser, type User } from '../auth.ts';
import { updateNote } from '../notes.ts';
import { setNoteReminder } from '../reminders.ts';
import {
	createTodos,
	moveTodo,
	setTodoTime,
	toggleTodo,
	updateTodoText,
	MAX_TODO_LENGTH
} from '../todos.ts';
import { addDays, timeIn, todayIn, zonedDateTime } from '#lib/format.ts';
import {
	eventIdFor,
	eventStart,
	hashEvent,
	noteEvent,
	parseTodoSummary,
	ruleEvent,
	todoEvent,
	type EventBody,
	type GoogleKind
} from '#lib/google-calendar.ts';
import {
	GoogleError,
	calendarApi,
	googleCalendarEnabled,
	refreshAccessToken,
	revokeToken
} from './client.ts';
import { channelToken, decrypt, encrypt } from './crypto.ts';

type Account = typeof s.googleAccount.$inferSelect;
type Ref = [GoogleKind, string];

export const APP_CALENDAR_NAME = 'NEURAL//NOTES';
/** Todo dei giorni passati ancora inviati a Google (al collegamento e quando cambiano le scelte). */
const PUSH_PAST_DAYS = 7;
/** Eventi dei calendari scelti trasformati in todo: da oggi a tanti giorni avanti. */
const IMPORT_DAYS = 60;
const MAX_ATTEMPTS = 8;
const CHANNEL_TTL_S = 7 * 24 * 60 * 60;

const appBase = () => (PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const enc = encodeURIComponent;

/** Errore leggibile da mostrare nelle impostazioni. */
function describe(e: unknown) {
	if (e instanceof GoogleError && e.message === 'invalid_grant')
		return 'Google ha revocato l’accesso: scollega e ricollega il calendario.';
	return e instanceof Error ? e.message : String(e);
}

/** Lavoro da finire dopo la risposta (Vercel aspetta la promessa; in locale gira e basta). */
function later(task: () => Promise<unknown>) {
	waitUntil(task().catch((e) => console.error('[google]', e)));
}

export async function getAccount(userId: string) {
	const [row] = await db.select().from(s.googleAccount).where(eq(s.googleAccount.userId, userId));
	return row ?? null;
}

/** Access token valido (rinnovato con il refresh token quando scade). */
async function accessToken(acct: Account) {
	if (acct.accessToken && acct.expiresAt && acct.expiresAt.getTime() > Date.now() + 60_000)
		return decrypt(acct.accessToken);
	const tokens = await refreshAccessToken(decrypt(acct.refreshToken));
	const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
	await db
		.update(s.googleAccount)
		.set({
			accessToken: encrypt(tokens.access_token),
			expiresAt,
			...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {})
		})
		.where(eq(s.googleAccount.userId, acct.userId));
	acct.accessToken = encrypt(tokens.access_token);
	acct.expiresAt = expiresAt;
	return tokens.access_token;
}

// --- Dall'app a Google ---

/**
 * Mette in coda gli elementi cambiati e li invia subito dopo la risposta. Senza Google Calendar
 * collegato non fa nulla (una sola query).
 */
export async function queueGoogle(userId: string, refs: Ref[]) {
	if (!refs.length || !googleCalendarEnabled()) return;
	const [acct] = await db
		.select({ target: s.googleAccount.targetCalendarId })
		.from(s.googleAccount)
		.where(eq(s.googleAccount.userId, userId));
	if (!acct?.target) return;
	await db
		.insert(s.googleOutbox)
		.values(refs.map(([kind, entityId]) => ({ userId, kind, entityId })))
		.onConflictDoNothing();
	later(() => flushOutbox(userId));
}

/** Evento che l'elemento dovrebbe avere ora (null = nessun evento). */
async function desiredEvent(acct: Account, user: User, kind: GoogleKind, id: string) {
	const common = { appUrl: appBase(), timeZone: user.timezone };
	if (kind === 'todo') {
		if (!acct.pushTodos) return null;
		const [row] = await db
			.select({ todo: s.todo, checklist: s.checklist })
			.from(s.todo)
			.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
			.where(and(eq(s.todo.id, id), eq(s.checklist.userId, user.id)));
		// le occorrenze dei ricorrenti stanno nell'evento della regola
		if (!row || row.todo.deletedAt || row.todo.ruleId || row.checklist.kind !== 'day') return null;
		// i todo nati da un evento di Google non tornano in Google come doppioni
		const [imported] = await db
			.select({ id: s.googleImport.todoId })
			.from(s.googleImport)
			.where(eq(s.googleImport.todoId, id));
		if (imported) return null;
		const [reminder] = await db
			.select({ fireAt: s.reminder.fireAt })
			.from(s.reminder)
			.where(eq(s.reminder.todoId, id))
			.orderBy(asc(s.reminder.fireAt))
			.limit(1);
		const time = reminder ? timeIn(reminder.fireAt, user.timezone) : null;
		if (!time && !acct.pushUntimedTodos) return null;
		return todoEvent(
			{ id, text: row.todo.text, done: !!row.todo.doneAt, day: row.checklist.day!, time },
			common
		);
	}
	if (kind === 'rule') {
		if (!acct.pushTodos) return null;
		const [rule] = await db
			.select()
			.from(s.todoRule)
			.where(and(eq(s.todoRule.id, id), eq(s.todoRule.userId, user.id)));
		if (!rule) return null;
		const time = rule.remindTime?.slice(0, 5) ?? null;
		if (!time && !acct.pushUntimedTodos) return null;
		const skipped = await db
			.select({ day: s.checklist.day })
			.from(s.todo)
			.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
			.where(and(eq(s.todo.ruleId, id), isNotNull(s.todo.deletedAt), eq(s.checklist.kind, 'day')));
		return ruleEvent(
			{
				id,
				text: rule.text,
				repeat: rule.repeat,
				startsOn: rule.startsOn,
				endsOn: rule.endsOn,
				time,
				skipped: skipped.map((r) => r.day!)
			},
			{
				...common,
				untilUtc:
					rule.endsOn && time ? zonedDateTime(rule.endsOn, '23:59', user.timezone) : undefined
			}
		);
	}
	if (!acct.pushNotes) return null;
	const [note] = await db
		.select()
		.from(s.note)
		.where(and(eq(s.note.id, id), eq(s.note.userId, user.id), isNull(s.note.deletedAt)));
	if (!note) return null;
	// l'ultimo promemoria impostato, anche se già arrivato: l'evento resta dov'era
	const [reminder] = await db
		.select({ fireAt: s.reminder.fireAt })
		.from(s.reminder)
		.where(eq(s.reminder.noteId, id))
		.orderBy(desc(s.reminder.createdAt))
		.limit(1);
	const at = reminder
		? `${todayIn(user.timezone, reminder.fireAt)}T${timeIn(reminder.fireAt, user.timezone)}`
		: null;
	return noteEvent({ id, title: note.title, text: note.text, day: note.day, at }, common);
}

type GoogleEventRes = {
	id: string;
	etag?: string;
	status?: string;
	summary?: string;
	updated?: string;
	start?: { date?: string; dateTime?: string };
	end?: { date?: string; dateTime?: string };
	location?: string;
	htmlLink?: string;
	transparency?: string;
};

/** Crea, aggiorna o elimina l'evento di un elemento; non scrive se non è cambiato nulla. */
async function pushEntity(acct: Account, user: User, token: string, kind: GoogleKind, id: string) {
	const calendar = enc(acct.targetCalendarId!);
	const desired = await desiredEvent(acct, user, kind, id);
	const [link] = await db
		.select()
		.from(s.googleEventLink)
		.where(and(eq(s.googleEventLink.kind, kind), eq(s.googleEventLink.entityId, id)));

	if (!desired) {
		if (!link) return;
		if (!link.detachedHash)
			await calendarApi(token, 'DELETE', `/calendars/${calendar}/events/${enc(link.eventId)}`);
		await db
			.delete(s.googleEventLink)
			.where(and(eq(s.googleEventLink.kind, kind), eq(s.googleEventLink.entityId, id)));
		return;
	}
	const hash = hashEvent(desired);
	// eliminato in Google: si ricrea solo se nel frattempo l'elemento è cambiato
	if (link?.detachedHash === hash) return;
	if (link && !link.detachedHash && link.hash === hash) return;

	const eventId = link?.eventId ?? eventIdFor(kind, id);
	const path = `/calendars/${calendar}/events/${enc(eventId)}`;
	const put = () => calendarApi<GoogleEventRes>(token, 'PUT', path, { body: desired });
	let event = await put();
	if (!event) {
		try {
			event = await calendarApi<GoogleEventRes>(token, 'POST', `/calendars/${calendar}/events`, {
				body: { ...desired, id: eventId } satisfies EventBody & { id: string }
			});
		} catch (e) {
			// creato nel frattempo da un altro invio
			if (!(e instanceof GoogleError && e.status === 409)) throw e;
			event = await put();
		}
	}
	if (!event) throw new Error(`Evento ${eventId} non scrivibile`);
	const values = { etag: event.etag ?? null, hash, detachedHash: null };
	await db
		.insert(s.googleEventLink)
		.values({ userId: user.id, kind, entityId: id, eventId, ...values })
		.onConflictDoUpdate({
			target: [s.googleEventLink.kind, s.googleEventLink.entityId],
			set: values
		});
}

/** Invia gli elementi in coda di un utente (ognuno una volta: la riga si "prende" eliminandola). */
export async function flushOutbox(userId: string) {
	const acct = await getAccount(userId);
	if (!acct?.targetCalendarId) return 0;
	const userRow = await getUser(userId);
	if (!userRow) return 0;
	const user = toUser(userRow);
	let done = 0;
	for (let round = 0; round < 10; round++) {
		const claimed = await db
			.delete(s.googleOutbox)
			.where(
				inArray(
					sql`(${s.googleOutbox.kind}, ${s.googleOutbox.entityId})`,
					db
						.select({ k: s.googleOutbox.kind, e: s.googleOutbox.entityId })
						.from(s.googleOutbox)
						.where(eq(s.googleOutbox.userId, userId))
						.orderBy(asc(s.googleOutbox.createdAt))
						.limit(50)
				)
			)
			.returning();
		if (!claimed.length) break;
		const token = await accessToken(acct);
		const seen = new Set<string>();
		for (const row of claimed) {
			const refs: Ref[] = [[row.kind, row.entityId]];
			// un'occorrenza cambiata (testo, ora, eliminata, spostata) cambia la serie
			if (row.kind === 'todo') {
				const [t] = await db
					.select({ ruleId: s.todo.ruleId })
					.from(s.todo)
					.where(eq(s.todo.id, row.entityId));
				if (t?.ruleId) refs.push(['rule', t.ruleId]);
			}
			for (const [kind, id] of refs) {
				if (seen.has(`${kind}:${id}`)) continue;
				seen.add(`${kind}:${id}`);
				try {
					await pushEntity(acct, user, token, kind, id);
					done++;
				} catch (e) {
					if (e instanceof GoogleError && e.message === 'invalid_grant') throw e;
					console.error('[google] invio', kind, id, e);
					if (row.attempts + 1 < MAX_ATTEMPTS)
						await db
							.insert(s.googleOutbox)
							.values({
								userId,
								kind,
								entityId: id,
								attempts: row.attempts + 1,
								lastError: describe(e)
							})
							.onConflictDoNothing();
				}
			}
		}
	}
	return done;
}

/** Tutti gli elementi che possono avere un evento (al collegamento e quando cambiano le scelte). */
async function queueEverything(user: User) {
	const today = todayIn(user.timezone);
	const todos = await db
		.select({ id: s.todo.id })
		.from(s.todo)
		.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
		.where(
			and(
				eq(s.checklist.userId, user.id),
				eq(s.checklist.kind, 'day'),
				gte(s.checklist.day, addDays(today, -PUSH_PAST_DAYS)),
				isNull(s.todo.deletedAt),
				isNull(s.todo.ruleId)
			)
		);
	const rules = await db
		.select({ id: s.todoRule.id })
		.from(s.todoRule)
		.where(
			and(
				eq(s.todoRule.userId, user.id),
				or(isNull(s.todoRule.endsOn), gte(s.todoRule.endsOn, today))
			)
		);
	const notes = await db
		.select({ id: s.note.id })
		.from(s.note)
		.where(
			and(
				eq(s.note.userId, user.id),
				isNull(s.note.deletedAt),
				or(
					gte(s.note.day, addDays(today, -30)),
					sql`exists (select 1 from ${s.reminder} where ${s.reminder.noteId} = ${s.note.id} and ${s.reminder.fireAt} > now() - interval '30 days')`
				)
			)
		);
	// anche gli elementi che hanno già un evento: se non vanno più inviati, l'evento si toglie
	const linked = await db
		.select({ kind: s.googleEventLink.kind, id: s.googleEventLink.entityId })
		.from(s.googleEventLink)
		.where(eq(s.googleEventLink.userId, user.id));
	const refs = new Map<string, Ref>();
	for (const r of todos) refs.set(`todo:${r.id}`, ['todo', r.id]);
	for (const r of rules) refs.set(`rule:${r.id}`, ['rule', r.id]);
	for (const r of notes) refs.set(`note:${r.id}`, ['note', r.id]);
	for (const r of linked) refs.set(`${r.kind}:${r.id}`, [r.kind, r.id]);
	if (!refs.size) return;
	await db
		.insert(s.googleOutbox)
		.values([...refs.values()].map(([kind, entityId]) => ({ userId: user.id, kind, entityId })))
		.onConflictDoNothing();
}

// --- Da Google all'app ---

/** Riporta nell'app una modifica fatta in Google all'evento di un todo o di una nota. */
async function applyRemote(user: User, kind: GoogleKind, id: string, event: GoogleEventRes) {
	const start = eventStart(event.start, user.timezone);
	if (!start) return;
	const today = todayIn(user.timezone);
	if (kind === 'todo') {
		const [row] = await db
			.select({ todo: s.todo, day: s.checklist.day })
			.from(s.todo)
			.innerJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
			.where(and(eq(s.todo.id, id), eq(s.checklist.userId, user.id), isNull(s.todo.deletedAt)));
		if (!row) return;
		const { done, text } = parseTodoSummary(event.summary ?? '');
		if (text && text !== row.todo.text && text.length <= MAX_TODO_LENGTH)
			await updateTodoText(user, id, text);
		// prima lo spostamento (rimette il todo da fare), poi fatto/non fatto e l'ora
		if (row.day && start.day !== row.day) await moveTodo(user, id, start.day);
		const [after] = await db
			.select({ doneAt: s.todo.doneAt })
			.from(s.todo)
			.where(eq(s.todo.id, id));
		if (after && done !== !!after.doneAt) await toggleTodo(user, id, done);
		const [reminder] = await db
			.select({ fireAt: s.reminder.fireAt })
			.from(s.reminder)
			.where(eq(s.reminder.todoId, id))
			.orderBy(asc(s.reminder.fireAt))
			.limit(1);
		const time = reminder ? timeIn(reminder.fireAt, user.timezone) : null;
		if (start.time !== time) await setTodoTime(user, id, start.time, today);
		return;
	}
	if (kind === 'note') {
		const [note] = await db
			.select()
			.from(s.note)
			.where(and(eq(s.note.id, id), eq(s.note.userId, user.id), isNull(s.note.deletedAt)));
		if (!note) return;
		const title = (event.summary ?? '').trim();
		const patch: { title?: string; day?: string } = {};
		if (title && title !== (note.title.trim() || 'Nota')) patch.title = title.slice(0, 200);
		if (note.day && note.day !== start.day) patch.day = start.day;
		if (!start.time && !note.day) patch.day = start.day;
		if (Object.keys(patch).length) await updateNote(user.id, id, patch, null, true);
		const [reminder] = await db
			.select({ fireAt: s.reminder.fireAt, sentAt: s.reminder.sentAt })
			.from(s.reminder)
			.where(eq(s.reminder.noteId, id))
			.orderBy(desc(s.reminder.createdAt))
			.limit(1);
		const at = reminder
			? `${todayIn(user.timezone, reminder.fireAt)}T${timeIn(reminder.fireAt, user.timezone)}`
			: null;
		const remoteAt = start.time ? `${start.day}T${start.time}` : null;
		if (remoteAt !== at && (remoteAt || (reminder && !reminder.sentAt)))
			await setNoteReminder(user, id, remoteAt);
	}
	// le serie ricorrenti si cambiano dall'app: la versione dell'app torna in Google
}

/** Modifiche fatte in Google al calendario dell'app dall'ultima lettura. */
async function pullAppCalendar(acct: Account, user: User, token: string) {
	if (!acct.targetCalendarId) return;
	const started = new Date();
	const since = new Date((acct.pulledAt ?? acct.createdAt).getTime() - 60_000);
	let pageToken: string | undefined;
	do {
		const page = await calendarApi<{ items?: GoogleEventRes[]; nextPageToken?: string }>(
			token,
			'GET',
			`/calendars/${enc(acct.targetCalendarId)}/events`,
			{
				query: {
					updatedMin: since.toISOString(),
					showDeleted: 'true',
					maxResults: '250',
					pageToken
				}
			}
		);
		if (!page) {
			// il calendario dell'app è stato eliminato in Google: lo si ricrea al prossimo invio
			await db
				.update(s.googleAccount)
				.set({ lastError: `Il calendario ${APP_CALENDAR_NAME} non esiste più in Google.` })
				.where(eq(s.googleAccount.userId, acct.userId));
			return;
		}
		for (const event of page.items ?? []) {
			const [link] = await db
				.select()
				.from(s.googleEventLink)
				.where(and(eq(s.googleEventLink.userId, user.id), eq(s.googleEventLink.eventId, event.id)));
			// non è dell'app, o è la nostra stessa scrittura
			if (!link || (link.etag && link.etag === event.etag)) continue;
			const where = and(
				eq(s.googleEventLink.kind, link.kind),
				eq(s.googleEventLink.entityId, link.entityId)
			);
			if (event.status === 'cancelled') {
				if (!link.detachedHash)
					await db
						.update(s.googleEventLink)
						.set({ detachedHash: link.hash ?? 'x', etag: event.etag ?? null })
						.where(where);
				continue;
			}
			if (acct.pullChanges && !link.detachedHash)
				await applyRemote(user, link.kind, link.entityId, event);
			// si riscrive la versione dell'app (con le modifiche appena riportate)
			await db
				.update(s.googleEventLink)
				.set({ etag: event.etag ?? null, hash: null, detachedHash: null })
				.where(where);
			await pushEntity(acct, user, token, link.kind, link.entityId);
		}
		pageToken = page.nextPageToken;
	} while (pageToken);
	await db
		.update(s.googleAccount)
		.set({ pulledAt: started })
		.where(eq(s.googleAccount.userId, acct.userId));
	acct.pulledAt = started;
}

/** Id del todo nato da un evento: sempre lo stesso, due letture insieme non creano doppioni. */
function importedTodoId(userId: string, calendarId: string, eventId: string) {
	const h = createHash('sha1').update(`gcal:${userId}:${calendarId}:${eventId}`).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type Imported = typeof s.googleImport.$inferSelect;

/**
 * Toglie i collegamenti con gli eventi; i todo di oggi in poi non ancora fatti se ne vanno con
 * l'evento (quelli passati o fatti restano).
 */
async function dropImports(user: User, links: Imported[]) {
	if (!links.length) return;
	const today = todayIn(user.timezone);
	const future = links.filter((l) => l.day >= today).map((l) => l.todoId);
	if (future.length)
		await db
			.update(s.todo)
			.set({ deletedAt: new Date() })
			.where(and(inArray(s.todo.id, future), isNull(s.todo.doneAt), isNull(s.todo.deletedAt)));
	await db.delete(s.googleImport).where(
		and(
			eq(s.googleImport.userId, user.id),
			inArray(
				s.googleImport.todoId,
				links.map((l) => l.todoId)
			)
		)
	);
}

/** Riporta nel todo solo quello che è cambiato in Google dall'ultima lettura. */
async function updateImported(
	user: User,
	link: Imported,
	remote: { title: string; day: string; time: string | null },
	today: string
) {
	const [todo] = await db
		.select({ deletedAt: s.todo.deletedAt })
		.from(s.todo)
		.where(eq(s.todo.id, link.todoId));
	if (!todo || todo.deletedAt) return;
	if (remote.title !== link.title) await updateTodoText(user, link.todoId, remote.title);
	if (remote.day !== link.day) await moveTodo(user, link.todoId, remote.day);
	if (remote.time !== link.time || remote.day !== link.day)
		await setTodoTime(user, link.todoId, remote.time, today);
}

/**
 * Trasforma in todo gli eventi di un calendario scelto, da oggi a IMPORT_DAYS giorni: un todo nel
 * giorno dell'evento, all'ora dell'inizio (con il promemoria) o senza ora se è di tutto il giorno.
 * Gli eventi spariti dal calendario tolgono i loro todo. False se il calendario non esiste più.
 */
async function importCalendar(user: User, token: string, calendarId: string) {
	const today = todayIn(user.timezone);
	const until = addDays(today, IMPORT_DAYS);
	const items: GoogleEventRes[] = [];
	let pageToken: string | undefined;
	do {
		const page = await calendarApi<{ items?: GoogleEventRes[]; nextPageToken?: string }>(
			token,
			'GET',
			`/calendars/${enc(calendarId)}/events`,
			{
				query: {
					singleEvents: 'true',
					orderBy: 'startTime',
					timeMin: zonedDateTime(today, '00:00', user.timezone).toISOString(),
					timeMax: zonedDateTime(until, '00:00', user.timezone).toISOString(),
					maxResults: '2500',
					pageToken
				}
			}
		);
		if (!page) return false;
		items.push(...(page.items ?? []));
		pageToken = page.nextPageToken;
	} while (pageToken && items.length < 5000);

	const links = await db
		.select()
		.from(s.googleImport)
		.where(and(eq(s.googleImport.userId, user.id), eq(s.googleImport.calendarId, calendarId)));
	const byEvent = new Map(links.map((l) => [l.eventId, l]));
	const seen = new Set<string>();
	for (const event of items) {
		if (event.status === 'cancelled') continue;
		const start = eventStart(event.start, user.timezone);
		if (!start) continue;
		seen.add(event.id);
		const remote = {
			title:
				(event.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TODO_LENGTH) ||
				'(senza titolo)',
			day: start.day,
			time: start.time
		};
		const link = byEvent.get(event.id);
		if (link) {
			if (link.title === remote.title && link.day === remote.day && link.time === remote.time)
				continue;
			await updateImported(user, link, remote, today);
			await db
				.update(s.googleImport)
				.set(remote)
				.where(
					and(
						eq(s.googleImport.userId, user.id),
						eq(s.googleImport.calendarId, calendarId),
						eq(s.googleImport.eventId, event.id)
					)
				);
			continue;
		}
		// eventi iniziati prima di oggi (es. di più giorni): non diventano todo
		if (remote.day < today) continue;
		const todoId = importedTodoId(user.id, calendarId, event.id);
		// todo rimasto da un collegamento tolto (calendario non più scelto e poi ripreso): si ricrea
		await db.delete(s.todo).where(and(eq(s.todo.id, todoId), isNotNull(s.todo.deletedAt)));
		try {
			await createTodos(
				user,
				{ day: remote.day, texts: [remote.title], ids: [todoId], time: remote.time },
				today
			);
		} catch (e) {
			// creato nello stesso momento da un'altra lettura (webhook e cron insieme)
			const [exists] = await db.select({ id: s.todo.id }).from(s.todo).where(eq(s.todo.id, todoId));
			if (!exists) throw e;
		}
		await db
			.insert(s.googleImport)
			.values({ userId: user.id, calendarId, eventId: event.id, todoId, ...remote })
			.onConflictDoNothing();
	}
	// eventi eliminati in Google o spostati fuori dalla finestra (solo con la lettura completa)
	if (!pageToken)
		await dropImports(
			user,
			links.filter((l) => !seen.has(l.eventId) && l.day >= today && l.day < until)
		);
	return true;
}

// --- Canali di notifica (events.watch) ---

const webhookUrl = () =>
	PUBLIC_APP_URL?.startsWith('https://') ? `${appBase()}/api/google/webhook` : null;

async function stopChannel(token: string, row: typeof s.googleCalendar.$inferSelect) {
	if (!row.channelId || !row.channelResourceId) return;
	await calendarApi(token, 'POST', '/channels/stop', {
		body: { id: row.channelId, resourceId: row.channelResourceId }
	}).catch(() => {});
}

/**
 * Allinea le righe google_calendar ai calendari usati (scelti + quello dell'app) e rinnova i canali
 * che scadono entro un giorno. I canali servono solo online (Google chiama un indirizzo https).
 */
async function syncChannels(acct: Account, token: string, renew: boolean) {
	const wanted = [
		...new Set([...acct.readCalendarIds, acct.targetCalendarId].filter(Boolean))
	] as string[];
	const rows = await db
		.select()
		.from(s.googleCalendar)
		.where(eq(s.googleCalendar.userId, acct.userId));
	for (const row of rows.filter((r) => !wanted.includes(r.calendarId))) {
		await stopChannel(token, row);
		await db
			.delete(s.googleCalendar)
			.where(
				and(
					eq(s.googleCalendar.userId, acct.userId),
					eq(s.googleCalendar.calendarId, row.calendarId)
				)
			);
	}
	const missing = wanted.filter((id) => !rows.some((r) => r.calendarId === id));
	if (missing.length)
		await db
			.insert(s.googleCalendar)
			.values(missing.map((calendarId) => ({ userId: acct.userId, calendarId })))
			.onConflictDoNothing();

	const address = webhookUrl();
	if (!address || !renew) return;
	const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const current = await db
		.select()
		.from(s.googleCalendar)
		.where(
			and(
				eq(s.googleCalendar.userId, acct.userId),
				or(isNull(s.googleCalendar.channelExpiresAt), lt(s.googleCalendar.channelExpiresAt, soon))
			)
		);
	for (const row of current) {
		await stopChannel(token, row);
		const channelId = randomUUID();
		const res = await calendarApi<{ resourceId: string; expiration?: string }>(
			token,
			'POST',
			`/calendars/${enc(row.calendarId)}/events/watch`,
			{
				body: {
					id: channelId,
					type: 'web_hook',
					address,
					token: channelToken(channelId),
					params: { ttl: String(CHANNEL_TTL_S) }
				}
			}
		).catch((e) => {
			console.error('[google] watch', row.calendarId, e);
			return null;
		});
		await db
			.update(s.googleCalendar)
			.set({
				channelId: res ? channelId : null,
				channelResourceId: res?.resourceId ?? null,
				channelExpiresAt: res
					? new Date(res.expiration ? Number(res.expiration) : Date.now() + CHANNEL_TTL_S * 1000)
					: null
			})
			.where(
				and(
					eq(s.googleCalendar.userId, acct.userId),
					eq(s.googleCalendar.calendarId, row.calendarId)
				)
			);
	}
}

// --- Giri di sincronizzazione ---

/**
 * Sincronizzazione completa di un utente: coda, modifiche fatte in Google, eventi in todo e (con
 * `channels`) rinnovo dei canali. Con `calendarId` solo quel calendario (dal webhook).
 */
export async function syncGoogle(
	userId: string,
	options: { channels?: boolean; calendarId?: string } = {}
) {
	const acct = await getAccount(userId);
	const userRow = acct && (await getUser(userId));
	if (!acct || !userRow) return false;
	const user = toUser(userRow);
	try {
		const token = await accessToken(acct);
		const only = options.calendarId;
		if (!only || only === acct.targetCalendarId) {
			await flushOutbox(userId);
			await pullAppCalendar(acct, user, token);
		}
		const imported = acct.readCalendarIds.filter(
			(id) => id !== acct.targetCalendarId && (!only || id === only)
		);
		const gone: string[] = [];
		for (const calendarId of imported)
			if (!(await importCalendar(user, token, calendarId))) gone.push(calendarId);
		if (!only) {
			// todo di calendari non più scelti (o spariti)
			const kept = acct.readCalendarIds.filter((id) => !gone.includes(id));
			await dropImports(
				user,
				await db
					.select()
					.from(s.googleImport)
					.where(
						and(
							eq(s.googleImport.userId, userId),
							kept.length ? notInArray(s.googleImport.calendarId, kept) : undefined
						)
					)
			);
		}
		if (gone.length) {
			acct.readCalendarIds = acct.readCalendarIds.filter((id) => !gone.includes(id));
			await db
				.update(s.googleAccount)
				.set({ readCalendarIds: acct.readCalendarIds })
				.where(eq(s.googleAccount.userId, userId));
		}
		if (!only) await syncChannels(acct, token, options.channels ?? false);
		await db
			.update(s.googleAccount)
			.set({ syncedAt: new Date(), ...(only ? {} : { lastError: null }) })
			.where(eq(s.googleAccount.userId, userId));
		return true;
	} catch (e) {
		console.error('[google] sync', userId, e);
		await db
			.update(s.googleAccount)
			.set({ lastError: describe(e) })
			.where(eq(s.googleAccount.userId, userId));
		return false;
	}
}

/** Giro del cron (ogni 15 minuti): tutti gli account collegati, canali compresi. */
export async function syncAllGoogle() {
	if (!googleCalendarEnabled()) return { accounts: 0, ok: 0 };
	const accounts = await db.select({ userId: s.googleAccount.userId }).from(s.googleAccount);
	let ok = 0;
	for (const { userId } of accounts) if (await syncGoogle(userId, { channels: true })) ok++;
	return { accounts: accounts.length, ok };
}

/** Notifica di Google su un canale: verifica il token e rilegge quel calendario dopo la risposta. */
export async function handleWebhook(channelId: string, token: string, state: string) {
	const [row] = await db
		.select()
		.from(s.googleCalendar)
		.where(eq(s.googleCalendar.channelId, channelId));
	if (!row) return 'unknown';
	const expected = channelToken(channelId);
	if (token.length !== expected.length || token !== expected) return 'forbidden';
	if (state !== 'sync') later(() => syncGoogle(row.userId, { calendarId: row.calendarId }));
	return 'ok';
}

// --- Collegamento e impostazioni ---

export type GoogleCalendarInfo = {
	id: string;
	name: string;
	color: string | null;
	primary: boolean;
};

/** Calendari dell'account Google (escluso quello dell'app), per le impostazioni. */
export async function listCalendars(userId: string): Promise<GoogleCalendarInfo[]> {
	const acct = await getAccount(userId);
	if (!acct) return [];
	const token = await accessToken(acct);
	const res = await calendarApi<{
		items?: {
			id: string;
			summary?: string;
			summaryOverride?: string;
			backgroundColor?: string;
			primary?: boolean;
		}[];
	}>(token, 'GET', '/users/me/calendarList', { query: { maxResults: '250' } });
	return (res?.items ?? [])
		.filter((c) => c.id !== acct.targetCalendarId)
		.map((c) => ({
			id: c.id,
			name: c.summaryOverride || c.summary || c.id,
			color: c.backgroundColor ?? null,
			primary: !!c.primary
		}))
		.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

/**
 * Dopo il consenso: salva i token, crea il calendario dell'app, sceglie il calendario principale
 * (i suoi eventi diventano todo) e mette in coda tutto quello che va inviato.
 */
export async function connectCalendar(
	user: User,
	google: { sub: string; email: string },
	tokens: { access_token: string; expires_in: number; refresh_token?: string }
) {
	const existing = await getAccount(user.id);
	if (!tokens.refresh_token && !existing) throw new Error('Google non ha dato l’accesso offline');
	const values = {
		googleSub: google.sub,
		email: google.email,
		accessToken: encrypt(tokens.access_token),
		expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
		...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
		lastError: null
	};
	if (existing) {
		await db.update(s.googleAccount).set(values).where(eq(s.googleAccount.userId, user.id));
		later(() => syncGoogle(user.id, { channels: true }));
		return;
	}
	const token = tokens.access_token;
	const calendar = await calendarApi<{ id: string }>(token, 'POST', '/calendars', {
		body: {
			summary: APP_CALENDAR_NAME,
			description: 'Todo e note di NEURAL//NOTES. Creato dall’app: scollegando si può eliminare.',
			timeZone: user.timezone
		}
	});
	const list = await calendarApi<{ items?: { id: string; primary?: boolean }[] }>(
		token,
		'GET',
		'/users/me/calendarList',
		{ query: { maxResults: '250' } }
	);
	const primary = list?.items?.find((c) => c.primary)?.id;
	await db
		.insert(s.googleAccount)
		.values({
			userId: user.id,
			refreshToken: encrypt(tokens.refresh_token!),
			...values,
			targetCalendarId: calendar!.id,
			readCalendarIds: primary ? [primary] : [],
			// si leggono solo le modifiche fatte da adesso
			pulledAt: new Date()
		})
		.onConflictDoNothing();
	await queueEverything(user);
	later(() => syncGoogle(user.id, { channels: true }));
}

export type GoogleSettings = {
	pushTodos: boolean;
	pushUntimedTodos: boolean;
	pushNotes: boolean;
	pullChanges: boolean;
	readCalendarIds: string[];
};

export async function updateGoogleSettings(user: User, settings: GoogleSettings) {
	const acct = await getAccount(user.id);
	if (!acct) return false;
	const pushChanged =
		acct.pushTodos !== settings.pushTodos ||
		acct.pushUntimedTodos !== settings.pushUntimedTodos ||
		acct.pushNotes !== settings.pushNotes;
	await db
		.update(s.googleAccount)
		.set({ ...settings, readCalendarIds: settings.readCalendarIds.slice(0, 20) })
		.where(eq(s.googleAccount.userId, user.id));
	// nomi e colori dei calendari scelti
	const calendars = await listCalendars(user.id).catch(() => []);
	for (const c of calendars.filter((c) => settings.readCalendarIds.includes(c.id)))
		await db
			.insert(s.googleCalendar)
			.values({ userId: user.id, calendarId: c.id, name: c.name, color: c.color })
			.onConflictDoUpdate({
				target: [s.googleCalendar.userId, s.googleCalendar.calendarId],
				set: { name: c.name, color: c.color }
			});
	if (pushChanged) await queueEverything(user);
	later(() => syncGoogle(user.id, { channels: true }));
	return true;
}

/** Scollega: chiude i canali, (a scelta) elimina il calendario dell'app, revoca l'accesso. */
export async function disconnectCalendar(userId: string, deleteCalendar: boolean) {
	const acct = await getAccount(userId);
	if (!acct) return;
	try {
		const token = await accessToken(acct);
		const rows = await db
			.select()
			.from(s.googleCalendar)
			.where(eq(s.googleCalendar.userId, userId));
		for (const row of rows) await stopChannel(token, row);
		if (deleteCalendar && acct.targetCalendarId)
			await calendarApi(token, 'DELETE', `/calendars/${enc(acct.targetCalendarId)}`).catch(
				() => {}
			);
	} catch (e) {
		console.error('[google] scollega', e);
	}
	await revokeToken(decrypt(acct.refreshToken));
	// i todo nati dagli eventi: restano quelli passati o fatti
	const userRow = await getUser(userId);
	if (userRow)
		await dropImports(
			toUser(userRow),
			await db.select().from(s.googleImport).where(eq(s.googleImport.userId, userId))
		);
	for (const table of [s.googleOutbox, s.googleEventLink, s.googleImport, s.googleCalendar])
		await db.delete(table).where(eq(table.userId, userId));
	await db.delete(s.googleAccount).where(eq(s.googleAccount.userId, userId));
}
