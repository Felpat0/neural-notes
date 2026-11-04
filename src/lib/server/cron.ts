// Autenticazione delle rotte /api/cron/*: header "Authorization: Bearer <CRON_SECRET>" oppure ?key=.
import { timingSafeEqual } from 'node:crypto';
import { CRON_SECRET } from '$app/env/private';

export function cronAuthorized(request: Request, url: URL) {
	if (!CRON_SECRET) return false;
	const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	const given = Buffer.from(header ?? url.searchParams.get('key') ?? '');
	const expected = Buffer.from(CRON_SECRET);
	return given.length === expected.length && timingSafeEqual(given, expected);
}
