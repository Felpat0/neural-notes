import { error, json } from '@sveltejs/kit';
import { cleanTags } from '#lib/notes.ts';
import { updateNote, type NotePatch } from '#lib/server/notes.ts';
import type { RequestHandler } from './$types';

const MAX_CONTENT_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 200_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Salvataggio automatico dall'editor: solo i campi cambiati, con l'updated_at conosciuto. */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== 'object') error(400, 'Richiesta non valida');

	const patch: NotePatch = {};
	if ('title' in body) {
		if (typeof body.title !== 'string' || body.title.length > 300) error(400, 'Titolo non valido');
		patch.title = body.title;
	}
	if ('content' in body) {
		if (!body.content || typeof body.content !== 'object') error(400, 'Contenuto non valido');
		if (JSON.stringify(body.content).length > MAX_CONTENT_BYTES)
			error(413, 'La nota è troppo lunga');
		if (typeof body.text !== 'string' || body.text.length > MAX_TEXT_LENGTH)
			error(400, 'Testo non valido');
		patch.content = body.content;
		patch.text = body.text;
	}
	if ('day' in body) {
		if (body.day !== null && (typeof body.day !== 'string' || !DAY.test(body.day)))
			error(400, 'Giorno non valido');
		patch.day = body.day as string | null;
	}
	if ('tags' in body) {
		const tags = cleanTags(body.tags);
		if (!tags) error(400, 'Tag non validi');
		patch.tags = tags;
	}
	if ('pinned' in body) {
		if (typeof body.pinned !== 'boolean') error(400, 'Valore non valido');
		patch.pinned = body.pinned;
	}

	const base = typeof body.base === 'string' ? body.base : null;
	const result = await updateNote(locals.user!.id, params.id, patch, base, body.force === true);
	if (!result) error(404, 'Nota non trovata');
	if (!result.ok) {
		const { title, content, text, day, tags, pinned, updatedAt } = result.current;
		return json(
			{ conflict: { title, content, text, day, tags, pinned, updatedAt } },
			{ status: 409 }
		);
	}
	return json({ updatedAt: result.updatedAt, tags: patch.tags });
};
