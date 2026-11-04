// Eventi di Google Calendar per todo, todo ricorrenti e note: costruzione del corpo dell'evento,
// regole RRULE e lettura degli orari. Funzioni pure, senza chiamate a Google.
import { createHash } from 'node:crypto';
import { addDays, timeIn, todayIn } from '#lib/format.ts';
import { parseRepeat, repeatsOn, type Repeat } from '#lib/repeat.ts';

export type GoogleKind = 'todo' | 'rule' | 'note';

/** Durata degli eventi con orario (todo e promemoria delle note). */
export const EVENT_MINUTES = 30;

type When = { dateTime: string; timeZone: string } | { date: string };

export type EventBody = {
	summary: string;
	description: string;
	start: When;
	end: When;
	recurrence?: string[];
	status: 'confirmed';
	transparency: 'opaque' | 'transparent';
	reminders: { useDefault: false; overrides: [] };
	extendedProperties: { private: { nnKind: GoogleKind; nnId: string } };
	source: { title: string; url: string };
};

/**
 * Id dell'evento scelto dall'app (base32hex: 0-9 e a-v), sempre lo stesso per un elemento: due
 * invii insieme non creano doppioni e un evento eliminato si può ripristinare.
 */
export const eventIdFor = (kind: GoogleKind, entityId: string) =>
	`nn${kind[0]}${createHash('sha1').update(`${kind}:${entityId}`).digest('hex')}`;

export const hashEvent = (body: EventBody) =>
	createHash('sha1').update(JSON.stringify(body)).digest('hex');

/** Ora locale + minuti, anche oltre la mezzanotte. */
function plusMinutes(day: string, time: string, minutes: number) {
	const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
	const pad = (n: number) => String(n).padStart(2, '0');
	return {
		day: addDays(day, Math.floor(total / 1440)),
		time: `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`
	};
}

function timing(day: string, time: string | null, timeZone: string) {
	if (!time) return { start: { date: day }, end: { date: addDays(day, 1) } };
	const end = plusMinutes(day, time, EVENT_MINUTES);
	return {
		start: { dateTime: `${day}T${time}:00`, timeZone },
		end: { dateTime: `${end.day}T${end.time}:00`, timeZone }
	};
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Prima occorrenza della regola da `from` in poi (null se non ce n'è entro un anno). */
export function firstOccurrence(repeat: Repeat, from: string) {
	for (let i = 0; i < 400; i++) {
		const day = addDays(from, i);
		if (repeatsOn(repeat, day)) return day;
	}
	return null;
}

/**
 * RRULE equivalente a `repeat`. Il "31 di ogni mese" (o 29, 30) cade sull'ultimo giorno nei mesi
 * corti, come in repeatsOn: il giorno più alto tra 28 e N che esiste nel mese.
 * `until`: ultimo giorno compreso; per gli eventi con orario va in UTC (fine di quel giorno).
 */
export function rrule(repeat: Repeat, until: { day: string; utc?: Date } | null = null) {
	const rule = parseRepeat(repeat);
	if (!rule) return null;
	let r: string;
	switch (rule.kind) {
		case 'daily':
			r = 'FREQ=DAILY';
			break;
		case 'weekdays':
			r = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
			break;
		case 'weekly':
			r = `FREQ=WEEKLY;BYDAY=${rule.days.map((d) => BYDAY[d - 1]).join(',')}`;
			break;
		case 'monthly':
			r =
				rule.date <= 28
					? `FREQ=MONTHLY;BYMONTHDAY=${rule.date}`
					: `FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: rule.date - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`;
			break;
	}
	if (until)
		r += `;UNTIL=${
			until.utc
				? until.utc
						.toISOString()
						.replace(/[-:]/g, '')
						.replace(/\.\d{3}/, '')
				: until.day.replaceAll('-', '')
		}`;
	return `RRULE:${r}`;
}

type Common = { appUrl: string; timeZone: string };

function base(kind: GoogleKind, id: string, url: string) {
	return {
		status: 'confirmed' as const,
		// niente promemoria di Google: gli avvisi sono le notifiche dell'app
		reminders: { useDefault: false as const, overrides: [] as [] },
		extendedProperties: { private: { nnKind: kind, nnId: id } },
		source: { title: 'NEURAL//NOTES', url }
	};
}

/** Todo della lista di un giorno: evento all'orario, o di tutto il giorno; fatto → "✓". */
export function todoEvent(
	todo: { id: string; text: string; done: boolean; day: string; time: string | null },
	c: Common
): EventBody {
	const url = `${c.appUrl}/?giorno=${todo.day}`;
	return {
		summary: todo.done ? `✓ ${todo.text}` : todo.text,
		description: `Todo di NEURAL//NOTES\n${url}`,
		...timing(todo.day, todo.time, c.timeZone),
		transparency: todo.time ? 'opaque' : 'transparent',
		...base('todo', todo.id, url)
	};
}

/** Todo ricorrente: un evento ricorrente dalla prima occorrenza (null se non ne ha più). */
export function ruleEvent(
	rule: {
		id: string;
		text: string;
		repeat: Repeat;
		startsOn: string;
		endsOn: string | null;
		time: string | null;
		// occorrenze eliminate o spostate in un altro giorno
		skipped: string[];
	},
	c: Common & { untilUtc?: Date }
): EventBody | null {
	const first = firstOccurrence(rule.repeat, rule.startsOn);
	if (!first || (rule.endsOn && rule.endsOn < first)) return null;
	const recurrence = [
		rrule(
			rule.repeat,
			rule.endsOn ? { day: rule.endsOn, utc: rule.time ? c.untilUtc : undefined } : null
		)!
	];
	const skipped = [...new Set(rule.skipped)].filter((d) => d >= first).sort();
	if (skipped.length)
		recurrence.push(
			rule.time
				? `EXDATE;TZID=${c.timeZone}:${skipped.map((d) => `${d.replaceAll('-', '')}T${rule.time!.replace(':', '')}00`).join(',')}`
				: `EXDATE;VALUE=DATE:${skipped.map((d) => d.replaceAll('-', '')).join(',')}`
		);
	const url = `${c.appUrl}/ricorrenti`;
	return {
		summary: rule.text,
		description: `Todo ricorrente di NEURAL//NOTES\n${url}`,
		...timing(first, rule.time, c.timeZone),
		recurrence,
		transparency: rule.time ? 'opaque' : 'transparent',
		...base('rule', rule.id, url)
	};
}

/** Nota con un giorno o un promemoria: evento all'ora del promemoria, o di tutto il giorno. */
export function noteEvent(
	note: { id: string; title: string; text: string; day: string | null; at: string | null },
	c: Common
): EventBody | null {
	const day = note.at?.slice(0, 10) ?? note.day;
	if (!day) return null;
	const url = `${c.appUrl}/note/${note.id}`;
	const preview = note.text.trim().slice(0, 300);
	return {
		summary: note.title.trim() || 'Nota',
		description: `${preview ? `${preview}\n\n` : ''}${url}`,
		...timing(day, note.at?.slice(11, 16) ?? null, c.timeZone),
		transparency: note.at ? 'opaque' : 'transparent',
		...base('note', note.id, url)
	};
}

/** Giorno e ora locali dell'inizio di un evento di Google (ora null = tutto il giorno). */
export function eventStart(
	start: { date?: string; dateTime?: string } | undefined,
	timeZone: string
) {
	if (start?.dateTime) {
		const at = new Date(start.dateTime);
		return { day: todayIn(timeZone, at), time: timeIn(at, timeZone) };
	}
	if (start?.date) return { day: start.date, time: null };
	return null;
}

/** Titolo di un evento di un todo: "✓ testo" = fatto. */
export function parseTodoSummary(summary: string) {
	const done = /^✓\s*/.test(summary);
	return { done, text: summary.replace(/^✓\s*/, '').replace(/\s+/g, ' ').trim() };
}

/**
 * Dati dell'id_token ricevuto direttamente dall'endpoint dei token di Google (via HTTPS, con il
 * segreto del client): la firma non serve, si controllano emittente, destinatario e scadenza.
 */
export function readIdToken(idToken: string, clientId: string, now = Date.now()) {
	try {
		const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
		if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) return null;
		if (payload.aud !== clientId || typeof payload.sub !== 'string') return null;
		if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null;
		return {
			sub: payload.sub as string,
			email: typeof payload.email === 'string' ? (payload.email as string) : null,
			emailVerified: payload.email_verified === true || payload.email_verified === 'true',
			name: typeof payload.name === 'string' ? (payload.name as string) : null
		};
	} catch {
		return null;
	}
}
