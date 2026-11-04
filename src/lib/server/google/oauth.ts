// Avvio del consenso di Google (accesso o collegamento del calendario) con state e PKCE in un cookie.
import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { CALENDAR_SCOPES, LOGIN_SCOPES, authUrl } from './client.ts';

const COOKIE = 'nn_oauth';

export type OAuthFlow = {
	state: string;
	verifier: string;
	mode: 'login' | 'connect';
	next: string;
	timezone: string;
};

/** Stesso indirizzo per accesso e collegamento: va registrato nel client OAuth di Google. */
export const redirectUri = (origin: string) => `${origin}/auth/google/callback`;

export function startOAuth(
	cookies: Cookies,
	origin: string,
	input: { mode: OAuthFlow['mode']; next?: string; timezone?: string; loginHint?: string }
) {
	const flow: OAuthFlow = {
		state: randomBytes(16).toString('base64url'),
		verifier: randomBytes(32).toString('base64url'),
		mode: input.mode,
		next: input.next ?? '/',
		timezone: input.timezone ?? ''
	};
	cookies.set(COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 10 * 60
	});
	return authUrl({
		redirectUri: redirectUri(origin),
		scopes: input.mode === 'connect' ? CALENDAR_SCOPES : LOGIN_SCOPES,
		state: flow.state,
		challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
		offline: input.mode === 'connect',
		loginHint: input.loginHint
	});
}

/** Il flusso salvato all'avvio (una volta sola: il cookie si cancella). */
export function takeOAuth(cookies: Cookies): OAuthFlow | null {
	const raw = cookies.get(COOKIE);
	cookies.delete(COOKIE, { path: '/' });
	if (!raw) return null;
	try {
		return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as OAuthFlow;
	} catch {
		return null;
	}
}
