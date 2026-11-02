import { fail, redirect } from '@sveltejs/kit';
import { createNote, restoreNote } from '#lib/server/notes.ts';
import type { Actions } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const day = String((await request.formData()).get('day') ?? '');
		const id = await createNote(locals.user!.id, { day: DAY.test(day) ? day : null });
		redirect(303, `/note/${id}`);
	},

	restore: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400);
		await restoreNote(locals.user!.id, id);
		redirect(303, `/note/${id}`);
	}
};
