import { error, redirect } from '@sveltejs/kit';
import { getNote, trashNote } from '#lib/server/notes.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const note = await getNote(locals.user!.id, params.id);
	if (!note) error(404, 'Nota non trovata');
	const { id, title, content, day, tags, pinned, updatedAt } = note;
	return { note: { id, title, content, day, tags, pinned, updatedAt } };
};

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		await trashNote(locals.user!.id, params.id);
		redirect(303, `/note?eliminata=${params.id}`);
	}
};
