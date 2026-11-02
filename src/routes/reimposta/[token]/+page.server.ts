import { fail, redirect } from '@sveltejs/kit';
import {
	consumeAuthToken,
	endOtherSessions,
	markEmailVerified,
	readAuthToken,
	setPassword,
	startSession
} from '#lib/server/auth.ts';
import { appUrl, passwordChangedEmail, sendMail } from '#lib/server/mail.ts';
import { passwordProblem } from '#lib/server/password.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const found = await readAuthToken(params.token, 'reset');
	return { email: found?.user.email ?? null };
};

export const actions: Actions = {
	default: async ({ params, request, cookies, locals, url }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		const logoutOthers = form.get('logoutOthers') === 'on';

		const problem = passwordProblem(password);
		if (problem) return fail(400, { passwordError: problem });
		if (password !== confirm) return fail(400, { confirmError: 'Le due password non coincidono.' });

		const found = await readAuthToken(params.token, 'reset');
		if (!found || !(await consumeAuthToken(found.token.id))) return fail(410, { expired: true });

		const { user } = found;
		await setPassword(user.id, password);
		// il link è arrivato a quell'indirizzo: vale anche come conferma dell'email
		if (!user.emailVerifiedAt) await markEmailVerified(user.id);
		if (logoutOthers) await endOtherSessions(user.id);
		await sendMail(
			passwordChangedEmail(user.email, user.name, appUrl(url.origin, '/password-dimenticata'))
		);
		// si entra subito (al posto di un'eventuale sessione di un altro account)
		if (locals.user?.id !== user.id || logoutOthers)
			await startSession(cookies, user.id, request.headers.get('user-agent'));
		redirect(303, '/');
	}
};
