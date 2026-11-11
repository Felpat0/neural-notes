import { error, json } from '@sveltejs/kit';
import { setVoiceConsent } from '#lib/server/voice.ts';
import type { RequestHandler } from './$types';

/** Consenso alla trascrizione delle note vocali con Gemini: { allow: true | false }. */
export const PUT: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { allow?: unknown } | null;
	if (typeof body?.allow !== 'boolean') error(400, 'Valore non valido');
	await setVoiceConsent(locals.user!.id, body.allow);
	return json({ consent: body.allow });
};
