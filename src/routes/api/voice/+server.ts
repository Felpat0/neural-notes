import { error, json } from '@sveltejs/kit';
import { queueGoogle } from '#lib/server/google/calendar.ts';
import {
	MAX_AUDIO_BYTES,
	audioSupported,
	saveVoiceNote,
	transcribe,
	voiceState
} from '#lib/server/voice.ts';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';

// la trascrizione si fa nella stessa richiesta: qualche secondo per un minuto di audio
export const config: Config = { maxDuration: 60 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nota vocale dalla coda del dispositivo (multipart): noteId, attachmentId, day, durationMs e il
 * file `audio`. Crea nota e allegato, poi trascrive. Ripetere l'invio non crea doppioni; se la
 * trascrizione non riesce l'audio resta salvato e si può riprovare dalla nota.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const state = await voiceState(user.id);
	if (!state.enabled) error(503, 'Note vocali non disponibili');
	if (!state.consent) error(403, 'Manca il consenso alla trascrizione');

	const length = Number(request.headers.get('content-length') ?? 0);
	if (length > MAX_AUDIO_BYTES + 64 * 1024) error(413, 'Registrazione troppo lunga');
	const form = await request.formData().catch(() => null);
	if (!form) error(400, 'Richiesta non valida');

	const noteId = String(form.get('noteId') ?? '');
	const attachmentId = String(form.get('attachmentId') ?? '');
	if (!UUID.test(noteId) || !UUID.test(attachmentId)) error(400, 'Id non valido');
	const day = form.get('day') ? String(form.get('day')) : null;
	if (day !== null && !DAY.test(day)) error(400, 'Giorno non valido');
	const duration = Number(form.get('durationMs'));
	const durationMs = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;

	const audio = form.get('audio');
	if (!(audio instanceof File) || !audio.size) error(400, 'Audio mancante');
	if (audio.size > MAX_AUDIO_BYTES) error(413, 'Registrazione troppo lunga');
	if (!audioSupported(audio.type)) error(415, `Formato audio non supportato (${audio.type})`);

	const saved = await saveVoiceNote(user, {
		noteId,
		attachmentId,
		day,
		mime: audio.type,
		durationMs,
		data: new Uint8Array(await audio.arrayBuffer())
	});
	if (!saved) error(409, 'Id già usato');

	const result =
		saved.transcript === 'done' ? { ok: true as const } : await transcribe(user, saved.id);
	await queueGoogle(user.id, [['note', noteId]]);
	return json({
		noteId,
		attachmentId,
		transcribed: result.ok,
		message: result.ok ? null : result.message
	});
};
