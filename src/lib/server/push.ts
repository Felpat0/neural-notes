// Notifiche push (Web Push con chiavi VAPID), come in japan-trip.
import webpush from 'web-push';
import { eq, inArray } from 'drizzle-orm';
import { PUBLIC_VAPID_KEY } from '$app/env/public';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$app/env/private';
import { db, schema as s } from './db/index.ts';

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export const pushEnabled = () => !!(PUBLIC_VAPID_KEY && VAPID_PRIVATE_KEY);

let configured = false;
function client() {
	if (!PUBLIC_VAPID_KEY || !VAPID_PRIVATE_KEY) throw new Error('Notifiche push non configurate');
	if (!configured) {
		webpush.setVapidDetails(
			VAPID_SUBJECT ?? 'mailto:noreply@example.com',
			PUBLIC_VAPID_KEY,
			VAPID_PRIVATE_KEY
		);
		configured = true;
	}
	return webpush;
}

/** Invia a un elenco di iscrizioni; quelle scadute (404/410) vengono rimosse. */
export async function sendPush(
	subscriptions: Pick<typeof s.pushSubscription.$inferSelect, 'endpoint' | 'p256dh' | 'auth'>[],
	payload: PushPayload
) {
	const wp = client();
	let sent = 0;
	await Promise.all(
		subscriptions.map(async (sub) => {
			try {
				await wp.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					JSON.stringify(payload),
					{ TTL: 60 * 60 }
				);
				sent++;
			} catch (e) {
				const status = (e as { statusCode?: number }).statusCode;
				if (status === 404 || status === 410)
					await db.delete(s.pushSubscription).where(eq(s.pushSubscription.endpoint, sub.endpoint));
				else console.error('Invio push fallito', status, (e as Error).message);
			}
		})
	);
	return sent;
}

/** Invia a tutti i dispositivi di questi utenti. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
	if (!userIds.length) return 0;
	const subs = await db
		.select()
		.from(s.pushSubscription)
		.where(inArray(s.pushSubscription.userId, userIds));
	return sendPush(subs, payload);
}
