import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db, schema as s } from '#lib/server/db/index.ts';
import {
	MAIL_LIMIT,
	createAuthToken,
	endOtherSessions,
	endSession,
	getUser,
	recordFailure,
	setPassword,
	tooManyAttempts,
	validTimezone
} from '#lib/server/auth.ts';
import { appUrl, sendMail, verifyEmail } from '#lib/server/mail.ts';
import { passwordProblem, verifyPassword } from '#lib/server/password.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const sessions = await db
		.select({
			id: s.session.id,
			userAgent: s.session.userAgent,
			createdAt: s.session.createdAt,
			lastSeenAt: s.session.lastSeenAt
		})
		.from(s.session)
		.where(and(eq(s.session.userId, locals.user!.id), gt(s.session.expiresAt, new Date())))
		.orderBy(desc(s.session.lastSeenAt));
	return {
		// l'id della sessione (hash del token) non va alla pagina: basta un indice
		sessions: sessions.map(({ id, ...x }, i) => ({
			...x,
			key: i,
			current: id === locals.sessionId
		}))
	};
};

export const actions: Actions = {
	account: async ({ request, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const timezone = String(form.get('timezone') ?? '');
		if (!name || name.length > 60)
			return fail(400, { accountError: 'Scrivi un nome (max 60 caratteri).' });
		if (!validTimezone(timezone)) return fail(400, { accountError: 'Fuso orario non valido.' });
		await db.update(s.user).set({ name, timezone }).where(eq(s.user.id, locals.user!.id));
		return { accountSaved: true };
	},

	password: async ({ request, locals }) => {
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('password') ?? '');
		const me = (await getUser(locals.user!.id))!;
		// chi non ha ancora una password (account solo Google) la imposta senza quella attuale
		if (me.passwordHash && !(await verifyPassword(current, me.passwordHash)))
			return fail(400, { currentError: 'La password attuale non è corretta.' });
		const problem = passwordProblem(next);
		if (problem) return fail(400, { passwordError: problem });
		await setPassword(me.id, next);
		// gli altri dispositivi devono rientrare con la password nuova
		await endOtherSessions(me.id, locals.sessionId ?? undefined);
		return { passwordSaved: true };
	},

	resendVerify: async ({ locals, url }) => {
		const me = locals.user!;
		if (me.emailVerified) return { verifySent: true };
		const keys = [`mail:${me.email}`];
		if (await tooManyAttempts(keys, MAIL_LIMIT))
			return fail(429, { verifyError: 'Troppe richieste: riprova tra un’ora.' });
		await recordFailure(keys, MAIL_LIMIT);
		const token = await createAuthToken(me.id, 'verify');
		if (!(await sendMail(verifyEmail(me.email, me.name, appUrl(url.origin, `/verifica/${token}`)))))
			return fail(502, { verifyError: 'Invio non riuscito: riprova più tardi.' });
		return { verifySent: true };
	},

	logoutOthers: async ({ locals }) => {
		await endOtherSessions(locals.user!.id, locals.sessionId ?? undefined);
		return { othersClosed: true };
	},

	logout: async ({ cookies }) => {
		await endSession(cookies);
		redirect(303, '/login');
	},

	deleteAccount: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const me = (await getUser(locals.user!.id))!;
		if (
			String(form.get('confirm') ?? '')
				.trim()
				.toUpperCase() !== 'ELIMINA'
		)
			return fail(400, { deleteError: 'Scrivi ELIMINA per confermare.' });
		if (
			me.passwordHash &&
			!(await verifyPassword(String(form.get('password') ?? ''), me.passwordHash))
		)
			return fail(400, { deleteError: 'Password non corretta.' });
		// tutto il resto (note, todo, sessioni…) si elimina a cascata
		await db.delete(s.user).where(eq(s.user.id, me.id));
		await endSession(cookies);
		redirect(303, '/login');
	}
};
