// Ritorno dal consenso di Google: accesso (o nuovo account) oppure collegamento del calendario.
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '#lib/server/db/index.ts';
import {
	createUser,
	findUserByEmail,
	findUserByGoogleSub,
	safeNext,
	signupNeedsCode,
	signupOpen,
	startSession
} from '#lib/server/auth.ts';
import { clientId, exchangeCode, type TokenResponse } from '#lib/server/google/client.ts';
import { connectCalendar } from '#lib/server/google/calendar.ts';
import { redirectUri, takeOAuth } from '#lib/server/google/oauth.ts';
import { readIdToken } from '#lib/google-calendar.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, locals, request }) => {
	const flow = takeOAuth(cookies);
	const back = (code: string) =>
		redirect(303, flow?.mode === 'connect' ? `/profilo?google=${code}` : `/login?google=${code}`);
	if (!flow || url.searchParams.get('state') !== flow.state) back('scaduto');
	if (url.searchParams.get('error') || !url.searchParams.get('code')) back('annullato');

	let tokens: TokenResponse | null = null;
	try {
		tokens = await exchangeCode(
			url.searchParams.get('code')!,
			redirectUri(url.origin),
			flow!.verifier
		);
	} catch (e) {
		console.error('[google] token', e);
	}
	const google = tokens?.id_token ? readIdToken(tokens.id_token, clientId()) : null;
	if (!tokens || !google?.email || !google.emailVerified) back('errore');
	const email = google!.email!;

	if (flow!.mode === 'connect') {
		const me = locals.user;
		if (!me) redirect(303, '/login?next=/profilo');
		const owner = await findUserByGoogleSub(google!.sub);
		if (owner && owner.id !== me.id) back('in-uso');
		if (!owner) await db.update(s.user).set({ googleSub: google!.sub }).where(eq(s.user.id, me.id));
		let ok = true;
		try {
			await connectCalendar(me, { sub: google!.sub, email }, tokens!);
		} catch (e) {
			console.error('[google] collegamento', e);
			ok = false;
		}
		back(ok ? 'collegato' : 'errore');
	}

	// accesso: account già collegato, poi stessa email confermata, poi nuovo account
	let user = await findUserByGoogleSub(google!.sub);
	if (!user) {
		const byEmail = await findUserByEmail(email);
		if (byEmail) {
			// un indirizzo non confermato potrebbe essere stato registrato da qualcun altro
			if (!byEmail.emailVerifiedAt) back('non-confermata');
			if (byEmail.googleSub) back('in-uso');
			await db.update(s.user).set({ googleSub: google!.sub }).where(eq(s.user.id, byEmail.id));
			user = byEmail;
		} else {
			if (!signupOpen()) back('chiusa');
			if (signupNeedsCode()) back('codice');
			const created = await createUser({
				name: (google!.name ?? email.split('@')[0]).slice(0, 60),
				email,
				password: null,
				googleSub: google!.sub,
				timezone: flow!.timezone || undefined
			});
			if (!created) back('errore');
			user = (await findUserByGoogleSub(google!.sub))!;
		}
	}
	await startSession(cookies, user.id, request.headers.get('user-agent'), true);
	redirect(303, safeNext(flow!.next));
};
