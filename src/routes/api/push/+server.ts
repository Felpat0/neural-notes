import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema as s } from '#lib/server/db/index.ts';
import { pushEnabled, sendPush } from '#lib/server/push.ts';
import type { RequestHandler } from './$types';

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string }; test?: boolean };

/** Iscrive questo dispositivo all'utente; con `test: true` invia anche una notifica di prova. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!pushEnabled()) error(503, 'Notifiche non configurate sul server');
	const body = (await request.json().catch(() => ({}))) as Body;
	const { endpoint, keys } = body;
	if (
		!endpoint?.startsWith('https://') ||
		endpoint.length > 1000 ||
		!keys?.p256dh ||
		!keys.auth ||
		keys.p256dh.length > 200 ||
		keys.auth.length > 100
	)
		error(400, 'Iscrizione non valida');

	const row = {
		endpoint,
		p256dh: keys.p256dh,
		auth: keys.auth,
		userId: locals.user!.id,
		userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null
	};
	await db
		.insert(s.pushSubscription)
		.values(row)
		.onConflictDoUpdate({ target: s.pushSubscription.endpoint, set: row });

	if (body.test) {
		const sent = await sendPush([row], {
			title: 'Notifiche attive',
			body: 'Qui arriveranno i promemoria di todo e note.',
			url: '/profilo'
		});
		return json({ ok: true, sent });
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { endpoint } = (await request.json().catch(() => ({}))) as Body;
	if (endpoint)
		await db
			.delete(s.pushSubscription)
			.where(
				and(
					eq(s.pushSubscription.endpoint, endpoint),
					eq(s.pushSubscription.userId, locals.user!.id)
				)
			);
	return json({ ok: true });
};
