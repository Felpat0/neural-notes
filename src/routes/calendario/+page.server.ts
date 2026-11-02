import { addDays, todayIn, weekOf } from '#lib/format.ts';
import { dayMarkers } from '#lib/server/todos.ts';
import type { PageServerLoad } from './$types';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mese AAAA-MM spostato di `n` mesi. */
function shiftMonth(month: string, n: number) {
	const d = new Date(`${month}-15T12:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + n);
	return d.toISOString().slice(0, 7);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const today = todayIn(user.timezone);
	const wanted = url.searchParams.get('mese');
	const month = wanted && MONTH.test(wanted) ? wanted : today.slice(0, 7);

	// settimane intere, da lunedì a domenica, che coprono il mese
	const first = weekOf(`${month}-01`)[0];
	const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1);
	const last = weekOf(lastOfMonth)[6];
	const days: string[] = [];
	for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);

	return {
		today,
		month,
		prev: shiftMonth(month, -1),
		next: shiftMonth(month, 1),
		days,
		markers: await dayMarkers(user.id, first, last)
	};
};
