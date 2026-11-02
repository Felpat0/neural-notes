import { fail } from '@sveltejs/kit';
import {
	MAIL_LIMIT,
	createAuthToken,
	findUserByEmail,
	normalizeEmail,
	recordFailure,
	tooManyAttempts,
	validEmail
} from '#lib/server/auth.ts';
import { appUrl, resetEmail, sendMail } from '#lib/server/mail.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ email: locals.user?.email ?? '' });

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const email = normalizeEmail(String((await request.formData()).get('email') ?? ''));
		if (!validEmail(email)) return fail(400, { email, error: 'Email non valida.' });

		const keys = [`reset:${email}`, `reset-ip:${getClientAddress()}`];
		if (await tooManyAttempts(keys, MAIL_LIMIT))
			return fail(429, { email, error: 'Troppe richieste: riprova tra un’ora.' });
		await recordFailure(keys, MAIL_LIMIT);

		// la risposta è la stessa che l'account esista o no
		const user = await findUserByEmail(email);
		if (user) {
			const token = await createAuthToken(user.id, 'reset');
			await sendMail(resetEmail(email, user.name, appUrl(url.origin, `/reimposta/${token}`)));
		}
		return { sent: true, email };
	}
};
