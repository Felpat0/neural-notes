import { redirect } from '@sveltejs/kit';
import { outbox } from '#lib/outbox.svelte.ts';
import type { PageLoad } from './$types';

// Nota creata sul dispositivo e non ancora sul server (vedi lib/new-note.ts): la pagina vive solo
// nel browser, con i dati della coda offline. Quando la nota arriva sul server si passa a quella.
export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
	const { user } = await parent(); // il layout ha già caricato la coda
	const draft = outbox.drafts.find((d) => d.id === params.id);
	if (!draft) redirect(307, `/note/${params.id}`);
	return { id: params.id, day: draft.day, timezone: user!.timezone };
};
