import { browser } from '$app/env';
import { outbox } from '#lib/outbox.svelte.ts';
import type { LayoutLoad } from './$types';

// La coda delle modifiche offline si carica prima delle pagine: così le liste ci rimettono sopra
// quello che non è ancora arrivato al server (anche se i dati vengono dalla cache).
export const load: LayoutLoad = async ({ data }) => {
	if (browser) await outbox.init(data.user?.id ?? null);
	return data;
};
