// Chiamato ogni minuto da cron-job.org: invia i promemoria arrivati all'ora.
import { error, json } from '@sveltejs/kit';
import { cronAuthorized } from '#lib/server/cron.ts';
import { pushEnabled } from '#lib/server/push.ts';
import { sendDueReminders } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ request, url }) => {
	if (!cronAuthorized(request, url)) error(401, 'Non autorizzato');
	if (!pushEnabled()) error(503, 'Notifiche non configurate sul server');
	return json(await sendDueReminders());
};

export const GET = handler;
export const POST = handler;
