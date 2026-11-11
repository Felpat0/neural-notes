import { voiceState } from '#lib/server/voice.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => ({
	user: locals.user,
	// pulsante delle note vocali: disponibile (Gemini e storage configurati) e consenso già dato
	voice: locals.user ? await voiceState(locals.user.id) : null
});
