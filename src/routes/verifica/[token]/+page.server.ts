import { consumeAuthToken, markEmailVerified, readAuthToken } from '#lib/server/auth.ts';
import type { PageServerLoad } from './$types';

// La conferma avviene all'apertura del link: non serve essere entrati.
export const load: PageServerLoad = async ({ params, locals }) => {
	const found = await readAuthToken(params.token, 'verify');
	if (!found || !(await consumeAuthToken(found.token.id)))
		return { ok: false, loggedIn: !!locals.user };
	await markEmailVerified(found.user.id);
	return { ok: true, email: found.user.email, loggedIn: !!locals.user };
};
