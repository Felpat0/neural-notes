import { error, redirect } from '@sveltejs/kit';
import { googleCalendarEnabled } from '#lib/server/google/client.ts';
import { startOAuth } from '#lib/server/google/oauth.ts';
import type { RequestHandler } from './$types';

/** Collega Google Calendar (dal Profilo): consenso con gli scope del calendario. */
export const GET: RequestHandler = ({ url, cookies, locals }) => {
	if (!googleCalendarEnabled()) error(404, 'Google Calendar non è configurato sul server');
	redirect(
		303,
		startOAuth(cookies, url.origin, {
			mode: 'connect',
			next: '/profilo',
			loginHint: locals.user!.email
		}),
		// verso il consenso di Google
		{ external: true }
	);
};
