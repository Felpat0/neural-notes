import { addDays, monthsAgo, monthsParam, todayIn, weekOf } from '#lib/format.ts';
import { DEFAULT_MONTHS, checklistIdsIn, groupNotes } from '#lib/notes.ts';
import { googleCalendarEnabled } from '#lib/server/google/client.ts';
import { agendaFor, getAccount } from '#lib/server/google/calendar.ts';
import { hasOlderNotes, listNotes, notesForDay } from '#lib/server/notes.ts';
import { noteReminders } from '#lib/server/reminders.ts';
import { checklistItems, dayMarkers, dayTodos, overdueTodos } from '#lib/server/todos.ts';
import type { User } from '#lib/server/auth.ts';
import type { PageServerLoad } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** "In sospeso": i todo non fatti degli ultimi 30 giorni. */
const OVERDUE_DAYS = 30;

/** Eventi di Google Calendar del giorno (null = calendario non collegato). */
async function agenda(user: User, day: string) {
	if (!googleCalendarEnabled() || !(await getAccount(user.id))) return null;
	return agendaFor(user, day);
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:home');
	const user = locals.user!;
	const today = todayIn(user.timezone);
	const wanted = url.searchParams.get('giorno');
	const day = wanted && DAY.test(wanted) && !Number.isNaN(Date.parse(wanted)) ? wanted : today;
	const week = weekOf(day);
	const months = monthsParam(url.searchParams.get('mesi'), DEFAULT_MONTHS);
	const since = monthsAgo(today, months);

	const [dayList, overdue, dayNotes, recent, older, markers, events] = await Promise.all([
		dayTodos(user, day),
		day === today ? overdueTodos(user, today, addDays(today, -OVERDUE_DAYS)) : [],
		notesForDay(user.id, day),
		listNotes(user.id, { since, today }),
		hasOlderNotes(user.id, since),
		dayMarkers(user.id, week[0], week[6]),
		agenda(user, day)
	]);

	// card "Note del giorno": con le checklist che compaiono nel loro testo
	const idsByNote = dayNotes.map((n) => checklistIdsIn(n.content));
	const [items, reminders] = await Promise.all([
		checklistItems(user, idsByNote.flat()),
		noteReminders(
			user,
			dayNotes.map((n) => n.id)
		)
	]);
	const cards = dayNotes.map(({ content, ...note }, i) => {
		void content;
		return {
			...note,
			reminder: reminders.get(note.id) ?? null,
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
		agenda: events,
		// le note del giorno sono già nelle card: nei gruppi non si ripetono
		groups: groupNotes(
			recent.filter((n) => n.day !== day),
			user.timezone
		),
		months,
		older
	};
};
