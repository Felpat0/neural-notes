// Chiamato ogni 15 minuti da cron-job.org: coda verso Google, modifiche fatte in Google, agenda e
// rinnovo dei canali di notifica (rete di sicurezza oltre al webhook).
import { error, json } from '@sveltejs/kit';
import { cronAuthorized } from '#lib/server/cron.ts';
import { googleCalendarEnabled } from '#lib/server/google/client.ts';
import { syncAllGoogle } from '#lib/server/google/calendar.ts';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ request, url }) => {
	if (!cronAuthorized(request, url)) error(401, 'Non autorizzato');
	if (!googleCalendarEnabled()) error(503, 'Google Calendar non configurato sul server');
	return json(await syncAllGoogle());
};

export const GET = handler;
export const POST = handler;
