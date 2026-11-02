// Raggruppamento delle note per periodo: In arrivo, Oggi, Questo mese, poi mese per mese.
// Funzione pura, condivisa tra pagine e server.
import { todayIn } from '#lib/format.ts';

export type NoteSummary = {
	id: string;
	title: string;
	preview: string;
	day: string | null;
	tags: string[];
	pinned: boolean;
	updatedAt: Date | string;
};

export type NoteGroup<T extends NoteSummary = NoteSummary> = {
	key: string;
	label: string;
	notes: T[];
};

const monthLabel = (month: string) => {
	const label = new Intl.DateTimeFormat('it', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${month}-15T12:00:00Z`));
	return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * In arrivo: assegnate a un giorno futuro. Oggi: modificate oggi. Questo mese: il resto del mese
 * corrente. Poi un gruppo per mese, dal più recente. Le fissate restano in cima al loro gruppo.
 * Il periodo è quello dell'ultima modifica, nel fuso dell'utente.
 */
export function groupNotes<T extends NoteSummary>(notes: T[], timeZone: string, now = new Date()) {
	const today = todayIn(timeZone, now);
	const thisMonth = today.slice(0, 7);
	const groups = new Map<string, NoteGroup<T>>();
	const add = (key: string, label: string, note: T) => {
		if (!groups.has(key)) groups.set(key, { key, label, notes: [] });
		groups.get(key)!.notes.push(note);
	};

	const sorted = [...notes].sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
	);
	for (const note of sorted) {
		if (note.day && note.day > today) {
			add('upcoming', 'In arrivo', note);
			continue;
		}
		const updated = todayIn(timeZone, new Date(note.updatedAt));
		if (updated === today) add('today', 'Oggi', note);
		else if (updated.slice(0, 7) === thisMonth) add('month', 'Questo mese', note);
		else add(updated.slice(0, 7), monthLabel(updated.slice(0, 7)), note);
	}

	const result = [...groups.values()];
	for (const group of result) {
		if (group.key === 'upcoming') group.notes.sort((a, b) => a.day!.localeCompare(b.day!));
		// stabile: le fissate in cima, il resto nell'ordine di modifica
		group.notes.sort((a, b) => Number(b.pinned) - Number(a.pinned));
	}
	const rank = (key: string) =>
		key === 'upcoming' ? 0 : key === 'today' ? 1 : key === 'month' ? 2 : 3;
	return result.sort((a, b) => rank(a.key) - rank(b.key) || b.key.localeCompare(a.key));
}

/** Ora (se modificata oggi) o data breve per l'elenco. */
export function noteStamp(
	note: Pick<NoteSummary, 'updatedAt'>,
	timeZone: string,
	now = new Date()
) {
	const updated = new Date(note.updatedAt);
	if (todayIn(timeZone, updated) === todayIn(timeZone, now))
		return new Intl.DateTimeFormat('it', { hour: '2-digit', minute: '2-digit', timeZone }).format(
			updated
		);
	return new Intl.DateTimeFormat('it', { day: '2-digit', month: '2-digit', timeZone }).format(
		updated
	);
}

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 30;

/** Tag puliti: minuscoli, senza # iniziale né spazi, senza doppioni. */
export function cleanTags(tags: unknown): string[] | null {
	if (!Array.isArray(tags)) return null;
	const out = new Set<string>();
	for (const tag of tags) {
		if (typeof tag !== 'string') return null;
		const clean = tag.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
		if (clean && clean.length <= MAX_TAG_LENGTH) out.add(clean);
	}
	return [...out].slice(0, MAX_TAGS);
}
