import { error, fail, redirect } from '@sveltejs/kit';
import {
	MAIL_LIMIT,
	checkSignupCode,
	createAuthToken,
	createUser,
	findUserByEmail,
	normalizeEmail,
	recordFailure,
	signupNeedsCode,
	signupOpen,
	startSession,
	tooManyAttempts,
	validEmail
} from '#lib/server/auth.ts';
import { appUrl, sendMail, signupAttemptEmail, verifyEmail } from '#lib/server/mail.ts';
import { passwordProblem } from '#lib/server/password.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	if (!signupOpen()) error(404, 'La registrazione è chiusa');
	return { needsCode: signupNeedsCode() };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		if (!signupOpen()) error(404, 'La registrazione è chiusa');
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = normalizeEmail(String(form.get('email') ?? ''));
		const password = String(form.get('password') ?? '');
		const timezone = String(form.get('timezone') ?? '');
		const values = { name, email };
		const ipKey = [`signup:${getClientAddress()}`];

		if (await tooManyAttempts(ipKey))
			return fail(429, { ...values, error: 'Troppi tentativi: riprova tra 15 minuti.' });
		if (!checkSignupCode(String(form.get('code') ?? ''))) {
			await recordFailure(ipKey);
			return fail(400, { ...values, codeError: "Codice d'invito non valido." });
		}
		if (!name || name.length > 60)
			return fail(400, { ...values, error: 'Scrivi il tuo nome (max 60 caratteri).' });
		if (!validEmail(email)) return fail(400, { ...values, error: 'Email non valida.' });
		const problem = passwordProblem(password);
		if (problem) return fail(400, { ...values, passwordError: problem });

		const user = await createUser({ name, email, password, timezone });
		if (!user) {
			// indirizzo già registrato: stessa risposta di una registrazione riuscita,
			// e un avviso al proprietario (con un limite, per non usarla per mandare spam)
			const mailKeys = [`mail:${email}`];
			if (!(await tooManyAttempts(mailKeys, MAIL_LIMIT))) {
				await recordFailure(mailKeys, MAIL_LIMIT);
				const existing = await findUserByEmail(email);
				if (existing)
					await sendMail(signupAttemptEmail(email, existing.name, appUrl(url.origin, '/login')));
			}
			return { checkInbox: true, email };
		}

		const token = await createAuthToken(user.id, 'verify');
		await sendMail(verifyEmail(email, name, appUrl(url.origin, `/verifica/${token}`)));
		await startSession(cookies, user.id, request.headers.get('user-agent'));
		redirect(303, '/?benvenuto=1');
	}
};
