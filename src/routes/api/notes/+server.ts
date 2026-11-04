import { error, json } from '@sveltejs/kit';
import { queueGoogle } from '#lib/server/google/calendar.ts';
import { createNote } from '#lib/server/notes.ts';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nota nuova con l'id scelto dal client (anche quando la crea offline e la invia dopo):
 * { id, day }. Ripetere la richiesta non crea doppioni.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { id?: unknown; day?: unknown } | null;
	if (typeof body?.id !== 'string' || !UUID.test(body.id)) error(400, 'Id non valido');
	const day = body.day ?? null;
	if (day !== null && (typeof day !== 'string' || !DAY.test(day))) error(400, 'Giorno non valido');
	const id = await createNote(locals.user!.id, { id: body.id, day });
	if (!id) error(409, 'Id già usato');
	await queueGoogle(locals.user!.id, [['note', id]]);
	return json({ id });
};
