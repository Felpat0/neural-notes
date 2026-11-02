// Chiamato ogni minuto da cron-job.org: invia i promemoria arrivati all'ora.
// Autenticazione: header "Authorization: Bearer <CRON_SECRET>" oppure ?key=<CRON_SECRET>.
import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { CRON_SECRET } from '$app/env/private';
import { pushEnabled } from '#lib/server/push.ts';
import { sendDueReminders } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';

function authorized(request: Request, url: URL) {
	if (!CRON_SECRET) return false;
	const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	const given = Buffer.from(header ?? url.searchParams.get('key') ?? '');
	const expected = Buffer.from(CRON_SECRET);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

const handler: RequestHandler = async ({ request, url }) => {
	if (!authorized(request, url)) error(401, 'Non autorizzato');
	if (!pushEnabled()) error(503, 'Notifiche non configurate sul server');
	return json(await sendDueReminders());
};

export const GET = handler;
export const POST = handler;
