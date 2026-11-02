// Note: elenco, ricerca, creazione, modifica con controllo delle versioni.
import { randomUUID } from 'node:crypto';
import { and, arrayContains, desc, eq, gte, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db, schema as s } from './db/index.ts';
import type { NoteSummary } from '#lib/notes.ts';

const PREVIEW_LENGTH = 160;

const summary = {
	id: s.note.id,
	title: s.note.title,
	preview: sql<string>`left(${s.note.text}, ${PREVIEW_LENGTH})`,
	day: s.note.day,
	tags: s.note.tags,
	pinned: s.note.pinned,
	updatedAt: s.note.updatedAt
};

const visible = (userId: string) =>
	and(eq(s.note.userId, userId), isNull(s.note.deletedAt), isNull(s.note.archivedAt));

/** `%` e `_` scritti dall'utente vanno cercati come caratteri, non come jolly. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Note dell'utente modificate da `since` in poi (più quelle assegnate a un giorno futuro),
 * filtrate per testo e tag.
 */
export async function listNotes(
	userId: string,
	options: { since?: Date; q?: string; tag?: string; today: string }
): Promise<NoteSummary[]> {
	const { since, q, tag, today } = options;
	return db
		.select(summary)
		.from(s.note)
		.where(
			and(
				visible(userId),
				since ? or(gte(s.note.updatedAt, since), sql`${s.note.day} > ${today}`) : undefined,
				q ? or(ilike(s.note.title, likePattern(q)), ilike(s.note.text, likePattern(q))) : undefined,
				tag ? arrayContains(s.note.tags, [tag]) : undefined
			)
		)
		.orderBy(desc(s.note.updatedAt))
		.limit(500);
}

/** Ci sono note più vecchie di `since` (per "Mesi precedenti")? */
export async function hasOlderNotes(userId: string, since: Date, tag?: string) {
	const [row] = await db
		.select({ id: s.note.id })
		.from(s.note)
		.where(
			and(
				visible(userId),
				sql`${s.note.updatedAt} < ${since.toISOString()}::timestamptz`,
				tag ? arrayContains(s.note.tags, [tag]) : undefined
			)
		)
		.limit(1);
	return !!row;
}

/** Tag usati dall'utente, dal più frequente. */
export async function listTags(userId: string) {
	const rows = await db.execute<{ tag: string }>(sql`
		select tag from ${s.note}, unnest(${s.note.tags}) as tag
		where ${s.note.userId} = ${userId} and ${s.note.deletedAt} is null
		group by tag order by count(*) desc, tag limit 30`);
	return rows.rows.map((r) => r.tag);
}

export async function createNote(userId: string, input: { day?: string | null } = {}) {
	const [user] = await db
		.select({ aiDefaultAllowed: s.user.aiDefaultAllowed })
		.from(s.user)
		.where(eq(s.user.id, userId));
	const id = randomUUID();
	await db.insert(s.note).values({
		id,
		userId,
		day: input.day ?? null,
		aiAllowed: user?.aiDefaultAllowed ?? false
	});
	return id;
}

export async function getNote(userId: string, id: string) {
	const [row] = await db
		.select()
		.from(s.note)
		.where(and(eq(s.note.id, id), eq(s.note.userId, userId), isNull(s.note.deletedAt)));
	return row ?? null;
}

export type NotePatch = Partial<{
	title: string;
	content: unknown;
	text: string;
	day: string | null;
	tags: string[];
	pinned: boolean;
}>;

/**
 * Salva le modifiche se nessun altro dispositivo ha salvato dopo `base` (l'updated_at che il
 * client conosce). `force` sovrascrive comunque. Restituisce la nota aggiornata o il conflitto.
 */
export async function updateNote(
	userId: string,
	id: string,
	patch: NotePatch,
	base: string | null,
	force = false
) {
	const [row] = await db
		.update(s.note)
		.set({ ...patch, updatedAt: new Date() })
		.where(
			and(
				eq(s.note.id, id),
				eq(s.note.userId, userId),
				isNull(s.note.deletedAt),
				force || !base
					? undefined
					: sql`date_trunc('milliseconds', ${s.note.updatedAt}) = ${base}::timestamptz`
			)
		)
		.returning({ updatedAt: s.note.updatedAt });
	if (row) return { ok: true as const, updatedAt: row.updatedAt };
	const current = await getNote(userId, id);
	return current ? { ok: false as const, current } : null;
}

/** Nel cestino (si può annullare subito); l'eliminazione definitiva è un passo successivo. */
export const trashNote = (userId: string, id: string) =>
	db
		.update(s.note)
		.set({ deletedAt: new Date() })
		.where(and(eq(s.note.id, id), eq(s.note.userId, userId)));

export const restoreNote = (userId: string, id: string) =>
	db
		.update(s.note)
		.set({ deletedAt: null })
		.where(and(eq(s.note.id, id), eq(s.note.userId, userId), isNotNull(s.note.deletedAt)));

/** Note assegnate a un giorno, con il contenuto (per trovarne le checklist). */
export async function notesForDay(userId: string, day: string) {
	return db
		.select({ ...summary, content: s.note.content })
		.from(s.note)
		.where(and(visible(userId), eq(s.note.day, day)))
		.orderBy(desc(s.note.pinned), desc(s.note.updatedAt));
}
