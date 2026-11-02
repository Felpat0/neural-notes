// Promemoria: invio di quelli in scadenza (dal cron, ogni minuto) e promemoria delle note.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db, schema as s } from './db/index.ts';
import { toUser, type User } from './auth.ts';
import { sendPushToUsers } from './push.ts';
import { dayTodos } from './todos.ts';
import { timeIn, todayIn, zonedDateTime } from '#lib/format.ts';

/** Promemoria più vecchi di così (es. dopo un'interruzione del cron) si saltano invece di arrivare tutti insieme. */
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/**
 * Le occorrenze di oggi dei ricorrenti con un'ora: create anche se l'utente non apre l'app,
 * così il loro promemoria parte.
 */
async function prepareTodayOccurrences() {
	const rows = await db
		.selectDistinct({ user: s.user })
		.from(s.todoRule)
		.innerJoin(s.user, eq(s.todoRule.userId, s.user.id))
		.where(isNotNull(s.todoRule.remindTime));
	for (const { user } of rows) await dayTodos(toUser(user), todayIn(user.timezone));
}

/** Invia i promemoria arrivati all'ora: prima li "prende" (sent_at), così due cron insieme non li doppiano. */
export async function sendDueReminders(now = new Date()) {
	await prepareTodayOccurrences();

	const claimed = await db
		.update(s.reminder)
		.set({ sentAt: now })
		.where(and(isNull(s.reminder.sentAt), lte(s.reminder.fireAt, now)))
		.returning({ id: s.reminder.id });
	if (!claimed.length) return { due: 0, sent: 0, skipped: 0 };

	const rows = await db
		.select({
			reminder: s.reminder,
			todoText: s.todo.text,
			todoDone: s.todo.doneAt,
			todoDeleted: s.todo.deletedAt,
			listDay: s.checklist.day,
			listNoteId: s.checklist.noteId,
			noteTitle: s.note.title,
			noteText: s.note.text,
			noteDeleted: s.note.deletedAt
		})
		.from(s.reminder)
		.leftJoin(s.todo, eq(s.reminder.todoId, s.todo.id))
		.leftJoin(s.checklist, eq(s.todo.checklistId, s.checklist.id))
		.leftJoin(s.note, eq(s.reminder.noteId, s.note.id))
		.where(
			inArray(
				s.reminder.id,
				claimed.map((c) => c.id)
			)
		);

	let sent = 0;
	let skipped = 0;
	for (const row of rows) {
		const { reminder } = row;
		const late = now.getTime() - reminder.fireAt.getTime() > MAX_DELAY_MS;
		// todo già fatto o eliminato, nota eliminata: niente notifica
		const gone = reminder.todoId
			? row.todoText === null || !!row.todoDone || !!row.todoDeleted
			: reminder.noteId
				? row.noteTitle === null || !!row.noteDeleted
				: true;
		if (late || gone) {
			skipped++;
			continue;
		}
		const payload = reminder.todoId
			? {
					title: row.todoText!,
					body: 'Promemoria · da fare',
					url: row.listNoteId
						? `/note/${row.listNoteId}`
						: row.listDay
							? `/?giorno=${row.listDay}`
							: '/',
					tag: `todo-${reminder.todoId}`
				}
			: {
					title: row.noteTitle || 'Nota',
					body: (row.noteText ?? '').slice(0, 140) || 'Promemoria',
					url: `/note/${reminder.noteId}`,
					tag: `note-${reminder.noteId}`
				};
		if ((await sendPushToUsers([reminder.userId], payload)) > 0) sent++;
	}
	return { due: claimed.length, sent, skipped };
}

// --- Promemoria delle note ---

/** Prossimo promemoria non ancora inviato di ogni nota, come "AAAA-MM-GGTHH:MM" nel fuso dell'utente. */
export async function noteReminders(user: User, noteIds: string[]) {
	const map = new Map<string, string>();
	if (!noteIds.length) return map;
	const rows = await db
		.select({ noteId: s.reminder.noteId, fireAt: s.reminder.fireAt })
		.from(s.reminder)
		.where(
			and(
				eq(s.reminder.userId, user.id),
				inArray(s.reminder.noteId, noteIds),
				isNull(s.reminder.sentAt)
			)
		)
		.orderBy(asc(s.reminder.fireAt));
	for (const r of rows)
		if (r.noteId && !map.has(r.noteId))
			map.set(r.noteId, `${todayIn(user.timezone, r.fireAt)}T${timeIn(r.fireAt, user.timezone)}`);
	return map;
}

/** Imposta (o toglie, con null) il promemoria di una nota; false se la nota non è dell'utente. */
export async function setNoteReminder(user: User, noteId: string, at: string | null) {
	const [note] = await db
		.select({ id: s.note.id, title: s.note.title })
		.from(s.note)
		.where(and(eq(s.note.id, noteId), eq(s.note.userId, user.id), isNull(s.note.deletedAt)));
	if (!note) return false;
	await db.delete(s.reminder).where(and(eq(s.reminder.noteId, noteId), isNull(s.reminder.sentAt)));
	if (at)
		await db.insert(s.reminder).values({
			id: randomUUID(),
			userId: user.id,
			noteId,
			fireAt: zonedDateTime(at.slice(0, 10), at.slice(11, 16), user.timezone),
			title: note.title || 'Nota'
		});
	return true;
}
