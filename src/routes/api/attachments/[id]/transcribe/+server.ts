import { error, json } from '@sveltejs/kit';
import { queueGoogle } from '#lib/server/google/calendar.ts';
import { getAttachment, transcribe } from '#lib/server/voice.ts';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';

export const config: Config = { maxDuration: 60 };

/** "Trascrivi di nuovo" dopo una trascrizione non riuscita. */
export const POST: RequestHandler = async ({ params, locals }) => {
	const row = await getAttachment(locals.user!.id, params.id);
	if (!row) error(404, 'Allegato non trovato');
	const result = await transcribe(locals.user!, row.id);
	if (result.ok) await queueGoogle(locals.user!.id, [['note', row.noteId]]);
	return json({ transcribed: result.ok, message: result.ok ? null : result.message });
};
