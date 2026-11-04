import { fail, redirect } from '@sveltejs/kit';
import { queueGoogle } from '#lib/server/google/calendar.ts';
import { createNote, restoreNote } from '#lib/server/notes.ts';
import type { Actions } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const day = String((await request.formData()).get('day') ?? '');
		// senza id del client non può fallire
		const id = (await createNote(locals.user!.id, { day: DAY.test(day) ? day : null }))!;
		await queueGoogle(locals.user!.id, [['note', id]]);
		redirect(303, `/note/${id}`);
	},

	restore: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400);
		await restoreNote(locals.user!.id, id);
		await queueGoogle(locals.user!.id, [['note', id]]);
		redirect(303, `/note/${id}`);
	}
};
