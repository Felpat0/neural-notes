// Aggiunta rapida: dal testo di un todo riconosce giorno, ora e ripetizione.
// "Chiamare Marco domani 15:00" → testo "Chiamare Marco", giorno di domani, ore 15:00.
import { addDays } from '#lib/format.ts';
import { WEEKDAY_NAMES, isoWeekday, repeatLabel, type Repeat } from '#lib/repeat.ts';

export type Token = { kind: 'day' | 'time' | 'repeat'; start: number; end: number; label: string };

export type Parsed = {
	text: string;
	day: string | null;
	time: string | null;
	repeat: Repeat | null;
	tokens: Token[];
};

// "lun", "lunedì", "lunedi" → 1 … 7
const WEEKDAY_WORDS: [RegExp, number][] = WEEKDAY_NAMES.map((name, i) => {
	const stem = name.slice(0, 3);
	const rest = name.slice(3).replace('ì', '[iì]');
	return [new RegExp(`^${stem}(?:${rest})?$`, 'i'), i + 1];
});
const weekdayOf = (word: string) => WEEKDAY_WORDS.find(([re]) => re.test(word))?.[1] ?? null;
const WEEKDAY_ALT = WEEKDAY_NAMES.map(
	(n) => `${n.slice(0, 3)}(?:${n.slice(3).replace('ì', '[iì]')})?`
).join('|');

const MONTHS_SHORT = [
	'gen',
	'feb',
	'mar',
	'apr',
	'mag',
	'giu',
	'lug',
	'ago',
	'set',
	'ott',
	'nov',
	'dic'
];

const pad = (n: number) => String(n).padStart(2, '0');

function dayLabel(day: string, today: string) {
	if (day === today) return 'Oggi';
	if (day === addDays(today, 1)) return 'Domani';
	const weekday = WEEKDAY_NAMES[isoWeekday(day) - 1];
	return `${weekday.slice(0, 3)} ${Number(day.slice(8, 10))} ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}`;
}

/** Prossimo giorno (da domani in poi) con quel giorno della settimana. */
function nextWeekday(today: string, weekday: number) {
	const diff = (weekday - isoWeekday(today) + 7) % 7 || 7;
	return addDays(today, diff);
}

function validDate(y: number, m: number, d: number) {
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

type Rule = {
	re: RegExp;
	kind: Token['kind'];
	apply: (m: RegExpExecArray, today: string) => string | null;
};

// Ogni espressione è tra confini di parola; la prima che riconosce un tipo vince.
// In JavaScript \b considera "ì" un carattere che non fa parte delle parole ("giovedì" non finirebbe
// mai con un confine): qui \b diventa un confine tra lettere (anche accentate) e il resto.
const WORD = '[\\p{L}\\p{N}]';
const BOUNDARY = `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`;
const re = (source: string) => new RegExp(source.replaceAll('\\b', BOUNDARY), 'iu');

const RULES: Rule[] = [
	{ kind: 'repeat', re: re('\\bogni giorno\\b'), apply: () => 'daily' },
	{
		kind: 'repeat',
		re: re('\\b(?:nei |i )?giorni feriali\\b|\\bogni giorno feriale\\b'),
		apply: () => 'weekdays'
	},
	{
		kind: 'repeat',
		re: re(`\\bogni ((?:${WEEKDAY_ALT})(?:(?:,\\s*|\\s+e\\s+)(?:${WEEKDAY_ALT}))*)\\b`),
		apply: (m) => {
			const days = m[1].split(/,\s*|\s+e\s+/).map(weekdayOf);
			return days.every(Boolean) ? `weekly:${[...new Set(days)].sort().join(',')}` : null;
		}
	},
	{
		kind: 'repeat',
		re: re('\\bogni mese(?: il (\\d{1,2}))?\\b'),
		apply: (m, today) => {
			const date = m[1] ? Number(m[1]) : Number(today.slice(8, 10));
			return date >= 1 && date <= 31 ? `monthly:${date}` : null;
		}
	},
	{ kind: 'day', re: re('\\boggi\\b'), apply: (_, today) => today },
	{ kind: 'day', re: re('\\bdopodomani\\b'), apply: (_, today) => addDays(today, 2) },
	{ kind: 'day', re: re('\\bdomani\\b'), apply: (_, today) => addDays(today, 1) },
	{
		kind: 'day',
		re: re('\\b(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2}|\\d{4}))?\\b'),
		apply: (m, today) => {
			const d = Number(m[1]);
			const mo = Number(m[2]);
			let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4));
			if (!validDate(y, mo, d)) return null;
			let day = `${y}-${pad(mo)}-${pad(d)}`;
			// senza anno: una data già passata è dell'anno prossimo
			if (!m[3] && day < today) {
				y += 1;
				if (!validDate(y, mo, d)) return null;
				day = `${y}-${pad(mo)}-${pad(d)}`;
			}
			return day;
		}
	},
	{
		kind: 'day',
		re: re(`\\b(?:(?:il|la|lo) )?(${WEEKDAY_ALT})\\b`),
		apply: (m, today) => {
			const weekday = weekdayOf(m[1]);
			return weekday ? nextWeekday(today, weekday) : null;
		}
	},
	{
		kind: 'time',
		re: re("\\b(?:alle |all'|ore )?([01]?\\d|2[0-3])[:.]([0-5]\\d)\\b"),
		apply: (m) => `${pad(Number(m[1]))}:${m[2]}`
	},
	{
		kind: 'time',
		re: re("\\b(?:alle|all'|ore) ?([01]?\\d|2[0-3])\\b"),
		apply: (m) => `${pad(Number(m[1]))}:00`
	}
];

/**
 * Riconosce le parti del testo. `disabled` sono i token che l'utente ha tolto toccando il chip:
 * quel tipo resta nel testo così com'è.
 */
export function quickParse(input: string, today: string, disabled: Token['kind'][] = []): Parsed {
	const found: { token: Token; value: string }[] = [];
	const taken: [number, number][] = [];
	const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);

	for (const rule of RULES) {
		if (disabled.includes(rule.kind) || found.some((f) => f.token.kind === rule.kind)) continue;
		const m = rule.re.exec(input);
		if (!m || overlaps(m.index, m.index + m[0].length)) continue;
		const value = rule.apply(m, today);
		if (!value) continue;
		taken.push([m.index, m.index + m[0].length]);
		found.push({
			value,
			token: {
				kind: rule.kind,
				start: m.index,
				end: m.index + m[0].length,
				label:
					rule.kind === 'day'
						? dayLabel(value, today)
						: rule.kind === 'time'
							? value
							: repeatLabel(value)
			}
		});
	}

	let text = input;
	for (const { token } of [...found].sort((a, b) => b.token.start - a.token.start))
		text = text.slice(0, token.start) + text.slice(token.end);
	text = text
		.replace(/\s{2,}/g, ' ')
		.replace(/\s+([,.;:!?])/g, '$1')
		.trim()
		.replace(/[,;:]$/, '')
		.trim();

	const get = (kind: Token['kind']) => found.find((f) => f.token.kind === kind)?.value ?? null;
	return {
		// se resta solo la data ("domani") il testo è tutto l'input
		text: text || input.trim(),
		day: get('day'),
		time: get('time'),
		repeat: get('repeat'),
		tokens: found.map((f) => f.token).sort((a, b) => a.start - b.start)
	};
}
