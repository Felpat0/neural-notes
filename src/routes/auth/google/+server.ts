import { redirect } from '@sveltejs/kit';
import { safeNext, validTimezone } from '#lib/server/auth.ts';
import { googleLoginEnabled } from '#lib/server/google/client.ts';
import { startOAuth } from '#lib/server/google/oauth.ts';
import type { RequestHandler } from './$types';

/** "Continua con Google" da accesso e registrazione. */
export const GET: RequestHandler = ({ url, cookies, locals }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.user) redirect(303, next);
	if (!googleLoginEnabled()) redirect(303, '/login');
	const timezone = url.searchParams.get('tz') ?? '';
	redirect(
		303,
		startOAuth(cookies, url.origin, {
			mode: 'login',
			next,
			timezone: validTimezone(timezone) ? timezone : ''
		}),
		// verso il consenso di Google
		{ external: true }
	);
};
