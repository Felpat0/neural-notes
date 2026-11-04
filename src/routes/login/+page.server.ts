import { fail, redirect } from '@sveltejs/kit';
import {
	clearFailures,
	findUserByEmail,
	normalizeEmail,
	recordFailure,
	safeNext,
	signupOpen,
	startSession,
	tooManyAttempts
} from '#lib/server/auth.ts';
import { googleLoginEnabled } from '#lib/server/google/client.ts';
import { verifyPassword } from '#lib/server/password.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return { signupOpen: signupOpen(), googleEnabled: googleLoginEnabled() };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email = normalizeEmail(String(form.get('email') ?? ''));
		const password = String(form.get('password') ?? '');
		const remember = form.get('remember') === 'on';
		const keys = [`email:${email}`, `ip:${getClientAddress()}`];

		if (await tooManyAttempts(keys))
			return fail(429, { email, error: 'Troppi tentativi sbagliati: riprova tra 15 minuti.' });
		const user = email ? await findUserByEmail(email) : null;
		// stessa risposta (e stesso tempo) per email sconosciuta, account solo Google e password sbagliata
		if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
			await recordFailure(keys);
			return fail(401, { email, error: 'Email o password non corretti.' });
		}
		await clearFailures(keys);
		await startSession(cookies, user.id, request.headers.get('user-agent'), remember);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
