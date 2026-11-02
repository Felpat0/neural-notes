import { todayIn, weekOf } from '#lib/format.ts';
import { dayTodos } from '#lib/server/todos.ts';
import type { PageServerLoad } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const today = todayIn(user.timezone);
	const wanted = url.searchParams.get('giorno');
	const day = wanted && DAY.test(wanted) && !Number.isNaN(Date.parse(wanted)) ? wanted : today;
	return {
		today,
		day,
		week: weekOf(day),
		welcome: url.searchParams.has('benvenuto'),
		dayList: await dayTodos(user, day)
	};
};
