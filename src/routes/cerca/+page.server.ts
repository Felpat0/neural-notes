import { todayIn } from '#lib/format.ts';
import { listNotes } from '#lib/server/notes.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const q = url.searchParams.get('q')?.trim().slice(0, 100) || '';
	if (!q) return { q, results: [] };
	const user = locals.user!;
	return { q, results: await listNotes(user.id, { q, today: todayIn(user.timezone) }) };
};
