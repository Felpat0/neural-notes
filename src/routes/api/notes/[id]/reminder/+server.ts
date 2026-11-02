import { error, json } from '@sveltejs/kit';
import { setNoteReminder } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';

const AT = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** Promemoria di una nota: { at: "AAAA-MM-GGTHH:MM" } nel fuso dell'utente, o { at: null } per toglierlo. */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => null)) as { at?: unknown } | null;
	const at = body?.at ?? null;
	if (at !== null && (typeof at !== 'string' || !AT.test(at) || Number.isNaN(Date.parse(at))))
		error(400, 'Data e ora non valide');
	if (!(await setNoteReminder(locals.user!, params.id, at as string | null)))
		error(404, 'Nota non trovata');
	return json({ at });
};
