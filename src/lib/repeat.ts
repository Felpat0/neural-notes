// Regole di ripetizione di todo e note, salvate come testo:
// 'daily' | 'weekdays' | 'weekly:1,4' (1 = lunedì … 7 = domenica) | 'monthly:15'

export type Repeat = string;

const WEEKDAY_NAMES = [
	'lunedì',
	'martedì',
	'mercoledì',
	'giovedì',
	'venerdì',
	'sabato',
	'domenica'
];

/** Giorno della settimana ISO (1 = lunedì … 7 = domenica) di una data AAAA-MM-GG. */
export const isoWeekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

const daysInMonth = (day: string) =>
	new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();

type Parsed =
	| { kind: 'daily' }
	| { kind: 'weekdays' }
	| { kind: 'weekly'; days: number[] }
	| { kind: 'monthly'; date: number };

export function parseRepeat(repeat: string): Parsed | null {
	if (repeat === 'daily') return { kind: 'daily' };
	if (repeat === 'weekdays') return { kind: 'weekdays' };
	const weekly = repeat.match(/^weekly:([1-7](?:,[1-7])*)$/);
	if (weekly)
		return { kind: 'weekly', days: [...new Set(weekly[1].split(',').map(Number))].sort() };
	const monthly = repeat.match(/^monthly:([1-9]|[12]\d|3[01])$/);
	if (monthly) return { kind: 'monthly', date: Number(monthly[1]) };
	return null;
}

export const isValidRepeat = (repeat: unknown): repeat is Repeat =>
	typeof repeat === 'string' && parseRepeat(repeat) !== null;

/** La regola vale per questo giorno? (il 31 di ogni mese cade sull'ultimo giorno nei mesi corti) */
export function repeatsOn(repeat: Repeat, day: string) {
	const rule = parseRepeat(repeat);
	if (!rule) return false;
	const weekday = isoWeekday(day);
	switch (rule.kind) {
		case 'daily':
			return true;
		case 'weekdays':
			return weekday <= 5;
		case 'weekly':
			return rule.days.includes(weekday);
		case 'monthly':
			return Number(day.slice(8, 10)) === Math.min(rule.date, daysInMonth(day));
	}
}

const joinNames = (names: string[]) =>
	names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];

export function repeatLabel(repeat: Repeat) {
	const rule = parseRepeat(repeat);
	if (!rule) return '';
	switch (rule.kind) {
		case 'daily':
			return 'Ogni giorno';
		case 'weekdays':
			return 'Giorni feriali';
		case 'weekly':
			return `Ogni ${joinNames(rule.days.map((d) => WEEKDAY_NAMES[d - 1]))}`;
		case 'monthly':
			return `Ogni mese il ${rule.date}`;
	}
}

/** Scelte del menu "Ripeti" per un todo di quel giorno. */
export function repeatOptions(day: string) {
	const weekday = isoWeekday(day);
	return [
		{ value: 'daily', label: 'Ogni giorno' },
		{ value: 'weekdays', label: 'Giorni feriali' },
		{ value: `weekly:${weekday}`, label: `Ogni ${WEEKDAY_NAMES[weekday - 1]}` },
		{
			value: `monthly:${Number(day.slice(8, 10))}`,
			label: `Ogni mese il ${Number(day.slice(8, 10))}`
		}
	];
}

export { WEEKDAY_NAMES };
