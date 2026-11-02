import { todayIn, weekOf } from '#lib/format.ts';
import type { PageServerLoad } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = ({ locals, url }) => {
	const today = todayIn(locals.user!.timezone);
	const wanted = url.searchParams.get('giorno');
	const day = wanted && DAY.test(wanted) && !Number.isNaN(Date.parse(wanted)) ? wanted : today;
	return { today, day, week: weekOf(day), welcome: url.searchParams.has('benvenuto') };
};
