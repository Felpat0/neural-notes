import { error, json } from '@sveltejs/kit';
import { deleteAttachment, getAttachment } from '#lib/server/voice.ts';
import { readFileBytes } from '#lib/server/storage.ts';
import type { RequestHandler } from './$types';

/** Il file di un allegato, solo al suo proprietario. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const row = await getAttachment(locals.user!.id, params.id);
	if (!row) error(404, 'Allegato non trovato');
	const data = await readFileBytes(row.storageKey);
	if (!data) error(404, 'File non trovato');
	return new Response(Buffer.from(data), {
		headers: {
			'content-type': row.mime,
			'content-length': String(data.byteLength),
			// il contenuto di un id non cambia mai
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};

/** Elimina l'audio; il testo già trascritto resta nella nota. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!(await deleteAttachment(locals.user!.id, params.id))) error(404, 'Allegato non trovato');
	return json({ ok: true });
};
