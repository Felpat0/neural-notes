// Note vocali: l'audio registrato dal dispositivo diventa una nota con l'audio in allegato, poi
// Gemini lo trascrive (testo ripulito, titolo e azioni da fare) e il testo entra nella nota.
// Serve il consenso dell'utente (user.voice_consent_at): l'audio va a Google.
import { and, eq, sql } from 'drizzle-orm';
import { db, schema as s } from './db/index.ts';
import type { User } from './auth.ts';
import { GeminiError, generateJson, geminiEnabled } from './gemini.ts';
import { createNote, getNote, updateNote } from './notes.ts';
import { deleteFiles, putFile, readFileBytes, storageEnabled } from './storage.ts';
import { createNoteChecklist, createTodos } from './todos.ts';
import { todayIn } from '#lib/format.ts';

/** Il body delle funzioni Vercel arriva al massimo a 4,5 MB: ~15 minuti di opus a 32 kbit/s. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Trascrizioni al giorno per utente (la quota gratuita di Gemini è condivisa). */
const DAILY_LIMIT = 60;
const MAX_TODOS = 20;

export const voiceEnabled = () => geminiEnabled() && storageEnabled();

export type VoiceState = { enabled: boolean; consent: boolean };

export async function voiceState(userId: string): Promise<VoiceState> {
	if (!voiceEnabled()) return { enabled: false, consent: false };
	const [row] = await db
		.select({ consent: s.user.voiceConsentAt, ai: s.user.aiEnabled })
		.from(s.user)
		.where(eq(s.user.id, userId));
	return { enabled: !!row?.ai, consent: !!row?.consent };
}

export async function setVoiceConsent(userId: string, allow: boolean) {
	await db
		.update(s.user)
		.set({ voiceConsentAt: allow ? new Date() : null })
		.where(eq(s.user.id, userId));
}

/** Tipo MIME dell'audio senza parametri (es. "audio/webm;codecs=opus" → "audio/webm"). */
export const baseMime = (mime: string) => mime.split(';')[0].trim().toLowerCase();

const EXTENSIONS: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/aac': 'aac',
	'audio/mpeg': 'mp3',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav'
};
const VIDEO_FALLBACK: Record<string, string> = {
	'audio/webm': 'video/webm',
	'audio/mp4': 'video/mp4'
};
export const audioSupported = (mime: string) => baseMime(mime) in EXTENSIONS;

/**
 * Salva nota e audio (con gli id scelti dal dispositivo: ripetere l'invio non crea doppioni).
 * Restituisce l'allegato, o null se l'id della nota è di un altro utente.
 */
export async function saveVoiceNote(
	user: User,
	input: {
		noteId: string;
		attachmentId: string;
		day: string | null;
		mime: string;
		durationMs: number | null;
		data: Uint8Array;
	}
) {
	const [existing] = await db
		.select()
		.from(s.attachment)
		.where(eq(s.attachment.id, input.attachmentId));
	if (existing) return existing.userId === user.id ? existing : null;

	if (!(await createNote(user.id, { id: input.noteId, day: input.day }))) return null;
	const mime = baseMime(input.mime);
	const storageKey = `${user.id}/${input.attachmentId}.${EXTENSIONS[mime]}`;
	await putFile(storageKey, input.data, mime);
	const [row] = await db
		.insert(s.attachment)
		.values({
			id: input.attachmentId,
			userId: user.id,
			noteId: input.noteId,
			kind: 'audio',
			storageKey,
			mime,
			size: input.data.byteLength,
			durationMs: input.durationMs,
			transcript: 'pending'
		})
		.onConflictDoNothing()
		.returning();
	if (row) return row;
	// arrivata nel frattempo la stessa richiesta (doppio invio)
	const [again] = await db
		.select()
		.from(s.attachment)
		.where(eq(s.attachment.id, input.attachmentId));
	return again?.userId === user.id ? again : null;
}

export async function getAttachment(userId: string, id: string) {
	const [row] = await db
		.select()
		.from(s.attachment)
		.where(and(eq(s.attachment.id, id), eq(s.attachment.userId, userId)));
	return row ?? null;
}

export async function noteAttachments(userId: string, noteId: string) {
	return db
		.select({
			id: s.attachment.id,
			kind: s.attachment.kind,
			mime: s.attachment.mime,
			durationMs: s.attachment.durationMs,
			transcript: s.attachment.transcript,
			transcriptError: s.attachment.transcriptError,
			createdAt: s.attachment.createdAt
		})
		.from(s.attachment)
		.where(and(eq(s.attachment.noteId, noteId), eq(s.attachment.userId, userId)))
		.orderBy(s.attachment.createdAt);
}

/** Elimina l'allegato e il suo file (il testo trascritto resta nella nota). */
export async function deleteAttachment(userId: string, id: string) {
	const row = await getAttachment(userId, id);
	if (!row) return false;
	await deleteFiles([row.storageKey]);
	await db.delete(s.attachment).where(eq(s.attachment.id, id));
	return true;
}

/** File di tutti gli allegati dell'utente (prima di eliminare l'account: il DB va a cascata). */
export async function deleteUserFiles(userId: string) {
	const rows = await db
		.select({ key: s.attachment.storageKey })
		.from(s.attachment)
		.where(eq(s.attachment.userId, userId));
	for (let i = 0; i < rows.length; i += 100)
		await deleteFiles(rows.slice(i, i + 100).map((r) => r.key));
}

/** Conta una richiesta AI; false se il limite di oggi è già raggiunto. */
async function takeQuota(user: User) {
	const day = todayIn(user.timezone);
	const { rows } = await db.execute<{ requests: number }>(sql`
		insert into ${s.aiUsage} (user_id, day, requests) values (${user.id}, ${day}, 1)
		on conflict (user_id, day) do update set requests = ${s.aiUsage.requests} + 1
		returning requests`);
	return Number(rows[0]?.requests ?? 0) <= DAILY_LIMIT;
}

type Transcript = { title: string; paragraphs: string[]; todos: string[] };

const SCHEMA = {
	type: 'OBJECT',
	properties: {
		title: { type: 'STRING', description: 'Titolo breve, al massimo 60 caratteri' },
		paragraphs: { type: 'ARRAY', items: { type: 'STRING' } },
		todos: { type: 'ARRAY', items: { type: 'STRING' } }
	},
	required: ['title', 'paragraphs', 'todos'],
	propertyOrdering: ['title', 'paragraphs', 'todos']
};

const SYSTEM = `Trascrivi una nota vocale registrata al volo con il telefono.
- paragraphs: la trascrizione fedele, nella lingua parlata, divisa in paragrafi. Togli esitazioni ("ehm", "cioè"), ripetizioni e false partenze; correggi la punteggiatura. Non aggiungere, riassumere o interpretare nulla. Se l'audio è vuoto o incomprensibile restituisci un elenco vuoto.
- title: un titolo breve (massimo 60 caratteri, senza punto finale) che dica di cosa parla la nota.
- todos: le azioni da fare dette esplicitamente ("devo chiamare Marco", "ricordarmi di comprare il latte"), ognuna come frase breve all'infinito con l'iniziale maiuscola ("Chiamare Marco", "Comprare il latte"). Elenco vuoto se non ce ne sono.`;

type Doc = { type: 'doc'; content: Record<string, unknown>[] };

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

/** Documento vuoto (nota appena creata, o con solo un paragrafo vuoto). */
function isEmptyDoc(content: unknown): boolean {
	const doc = content as Doc | null;
	if (!doc?.content?.length) return true;
	return doc.content.every((n) => n.type === 'paragraph' && !(n.content as unknown[])?.length);
}

/**
 * Trascrive l'audio e aggiunge il testo alla nota (in fondo, se nel frattempo è stata scritta).
 * L'esito resta sull'allegato: 'done', oppure 'error' con il motivo (si può riprovare).
 */
export async function transcribe(user: User, attachmentId: string) {
	const row = await getAttachment(user.id, attachmentId);
	if (!row) return { ok: false as const, message: 'Allegato non trovato' };
	if (row.transcript === 'done') return { ok: true as const };

	const fail = async (message: string) => {
		await db
			.update(s.attachment)
			.set({ transcript: 'error', transcriptError: message })
			.where(eq(s.attachment.id, row.id));
		return { ok: false as const, message };
	};

	const state = await voiceState(user.id);
	if (!state.enabled) return fail('Trascrizione non disponibile');
	if (!state.consent) return fail('Manca il consenso alla trascrizione');
	if (!(await takeQuota(user))) return fail('Limite di trascrizioni di oggi raggiunto');

	const audio = await readFileBytes(row.storageKey);
	if (!audio) return fail('Audio non trovato');

	const data = Buffer.from(audio).toString('base64');
	const ask = (mime: string) =>
		generateJson<Transcript>({
			system: SYSTEM,
			schema: SCHEMA,
			parts: [{ inline_data: { mime_type: mime, data } }, { text: 'Trascrivi questa nota vocale.' }]
		});
	let result: Transcript;
	try {
		try {
			({ data: result } = await ask(row.mime));
		} catch (e) {
			// webm (Chrome) e mp4 (Safari) non sono tra i formati audio elencati da Gemini, ma lo
			// sono come video: se il tipo audio viene rifiutato si riprova così
			const video = VIDEO_FALLBACK[row.mime];
			if (!(e instanceof GeminiError && e.status === 400 && video)) throw e;
			({ data: result } = await ask(video));
		}
	} catch (e) {
		return fail(e instanceof GeminiError ? e.message : 'Trascrizione non riuscita');
	}

	const paragraphs = (result.paragraphs ?? []).map((p) => String(p).trim()).filter(Boolean);
	const todos = (result.todos ?? [])
		.map((t) => String(t).trim().slice(0, 500))
		.filter(Boolean)
		.slice(0, MAX_TODOS);
	const title = String(result.title ?? '')
		.trim()
		.replace(/[.\s]+$/, '')
		.slice(0, 120);
	if (!paragraphs.length) return fail('Nessuna parola riconosciuta nell’audio');

	const blocks: Record<string, unknown>[] = paragraphs.map(paragraph);
	if (todos.length) {
		const checklistId = await createNoteChecklist(user, row.noteId);
		if (checklistId) {
			await createTodos(user, { checklistId, texts: todos }, todayIn(user.timezone));
			blocks.push({ type: 'checklistEmbed', attrs: { checklistId } });
		}
	}

	// la nota può cambiare mentre si scrive (l'utente l'ha aperta): si riprova sulla versione nuova
	for (let attempt = 0; attempt < 3; attempt++) {
		const note = await getNote(user.id, row.noteId);
		if (!note) return fail('Nota eliminata');
		const empty = isEmptyDoc(note.content);
		const doc: Doc = empty
			? { type: 'doc', content: blocks }
			: {
					type: 'doc',
					content: [...((note.content as Doc).content ?? []), ...blocks]
				};
		const added = paragraphs.join('\n');
		const saved = await updateNote(
			user.id,
			note.id,
			{
				content: doc,
				text: empty || !note.text ? added : `${note.text}\n${added}`,
				...(note.title.trim() ? {} : { title: title || 'Nota vocale' })
			},
			note.updatedAt.toISOString()
		);
		if (!saved) return fail('Nota eliminata');
		if (saved.ok) {
			await db
				.update(s.attachment)
				.set({ transcript: 'done', transcriptError: null })
				.where(eq(s.attachment.id, row.id));
			return { ok: true as const, noteId: note.id };
		}
	}
	return fail('La nota è cambiata durante la trascrizione: riprova');
}
