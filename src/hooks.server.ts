import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, readSession } from '#lib/server/auth.ts';

// Pagine dell'account che funzionano senza essere entrati; /api/cron/ ha un segreto suo.
const PUBLIC_PATHS = [
	'/api/cron/',
	'/login',
	'/registrati',
	'/password-dimenticata',
	'/reimposta/',
	'/verifica/',
	'/manifest.webmanifest'
];

export const handle: Handle = async ({ event, resolve }) => {
	const session = await readSession(event.cookies.get(SESSION_COOKIE));
	event.locals.user = session?.user ?? null;
	event.locals.sessionId = session?.sessionId ?? null;

	const { pathname } = event.url;
	const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
	if (!event.locals.user && !isPublic) {
		if (pathname.startsWith('/api/')) error(401, 'Accesso richiesto');
		const next = pathname + event.url.search;
		redirect(303, next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};
