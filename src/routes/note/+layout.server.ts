import { monthsAgo, monthsParam, todayIn } from '#lib/format.ts';
import { DEFAULT_MONTHS, groupNotes } from '#lib/notes.ts';
import { hasOlderNotes, listNotes, listTags } from '#lib/server/notes.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, depends }) => {
	depends('app:notes');
	const user = locals.user!;
	const q = url.searchParams.get('q')?.trim().slice(0, 100) || '';
	const tag = url.searchParams.get('tag')?.trim().toLowerCase() || '';
	const months = monthsParam(url.searchParams.get('mesi'), DEFAULT_MONTHS);
	const today = todayIn(user.timezone);
	// cercando si guarda in tutte le note, non solo negli ultimi mesi
	const since = q ? undefined : monthsAgo(today, months);

	const [notes, tags, older] = await Promise.all([
		listNotes(user.id, { since, q, tag, today }),
		listTags(user.id),
		since ? hasOlderNotes(user.id, since, tag || undefined) : false
	]);
	return {
		groups: groupNotes(notes, user.timezone),
		tags,
		q,
		tag,
		months,
		older,
		count: notes.length
	};
};
