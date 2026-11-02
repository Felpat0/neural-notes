import { addDays, monthsAgo, monthsParam, todayIn, weekOf } from '#lib/format.ts';
import { DEFAULT_MONTHS, checklistIdsIn, groupNotes } from '#lib/notes.ts';
import { hasOlderNotes, listNotes, notesForDay } from '#lib/server/notes.ts';
import { checklistItems, dayMarkers, dayTodos, overdueTodos } from '#lib/server/todos.ts';
import type { PageServerLoad } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** "In sospeso": i todo non fatti degli ultimi 30 giorni. */
const OVERDUE_DAYS = 30;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:home');
	const user = locals.user!;
	const today = todayIn(user.timezone);
	const wanted = url.searchParams.get('giorno');
	const day = wanted && DAY.test(wanted) && !Number.isNaN(Date.parse(wanted)) ? wanted : today;
	const week = weekOf(day);
	const months = monthsParam(url.searchParams.get('mesi'), DEFAULT_MONTHS);
	const since = monthsAgo(today, months);

	const [dayList, overdue, dayNotes, recent, older, markers] = await Promise.all([
		dayTodos(user, day),
		day === today ? overdueTodos(user, today, addDays(today, -OVERDUE_DAYS)) : [],
		notesForDay(user.id, day),
		listNotes(user.id, { since, today }),
		hasOlderNotes(user.id, since),
		dayMarkers(user.id, week[0], week[6])
	]);

	// card "Note del giorno": con le checklist che compaiono nel loro testo
	const idsByNote = dayNotes.map((n) => checklistIdsIn(n.content));
	const items = await checklistItems(user, idsByNote.flat());
	const cards = dayNotes.map(({ content, ...note }, i) => {
		void content;
		return {
			...note,
			checklists: idsByNote[i].map((id) => ({ id, items: items.get(id) ?? [] }))
		};
	});

	return {
		today,
		day,
		week,
		markers,
		welcome: url.searchParams.has('benvenuto'),
		dayList,
		overdue,
		cards,
		// le note del giorno sono già nelle card: nei gruppi non si ripetono
		groups: groupNotes(
			recent.filter((n) => n.day !== day),
			user.timezone
		),
		months,
		older
	};
};
