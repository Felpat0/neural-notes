import { error, redirect } from '@sveltejs/kit';
import { todayIn } from '#lib/format.ts';
import { queueGoogle } from '#lib/server/google/calendar.ts';
import { getNote, trashNote } from '#lib/server/notes.ts';
import { noteReminders } from '#lib/server/reminders.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const note = await getNote(locals.user!.id, params.id);
	if (!note) error(404, 'Nota non trovata');
	const { id, title, content, day, tags, pinned, updatedAt } = note;
	return {
		note: { id, title, content, day, tags, pinned, updatedAt },
		today: todayIn(locals.user!.timezone),
		reminder: (await noteReminders(locals.user!, [id])).get(id) ?? null
	};
};

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		await trashNote(locals.user!.id, params.id);
		await queueGoogle(locals.user!.id, [['note', params.id]]);
		redirect(303, `/note?eliminata=${params.id}`);
	}
};
