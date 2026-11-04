// Notifiche di Google Calendar (events.watch): un calendario è cambiato, lo si rilegge.
import { error, text } from '@sveltejs/kit';
import { handleWebhook } from '#lib/server/google/calendar.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const channelId = request.headers.get('x-goog-channel-id') ?? '';
	const token = request.headers.get('x-goog-channel-token') ?? '';
	const state = request.headers.get('x-goog-resource-state') ?? '';
	if (!channelId) error(400);
	const result = await handleWebhook(channelId, token, state);
	if (result === 'forbidden') error(403);
	// canale sconosciuto (già chiuso): 200 lo stesso, Google smette quando scade
	return text('ok');
};
