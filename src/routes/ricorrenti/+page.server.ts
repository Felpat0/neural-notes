import { fail } from '@sveltejs/kit';
import { todayIn } from '#lib/format.ts';
import { queueGoogle } from '#lib/server/google/calendar.ts';
import { listRules, stopRule } from '#lib/server/todos.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const today = todayIn(user.timezone);
	const rules = await listRules(user.id, today);
	return {
		rules: rules
			// interrotte oggi: non ce ne sono più da domani
			.filter((r) => r.endsOn !== today)
			.map((r) => ({
				id: r.id,
				text: r.text,
				repeat: r.repeat,
				startsOn: r.startsOn,
				time: r.remindTime?.slice(0, 5) ?? null
			}))
	};
};

export const actions: Actions = {
	stop: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400);
		await stopRule(locals.user!.id, id, todayIn(locals.user!.timezone));
		await queueGoogle(locals.user!.id, [['rule', id]]);
		return { stopped: true };
	}
};
