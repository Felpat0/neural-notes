// OAuth e API di Google con fetch diretti (niente pacchetto googleapis, troppo pesante per Vercel).
import { GOOGLE_API_BASE, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { validTokenKey } from './crypto.ts';

// GOOGLE_API_BASE: un finto server per i test in locale, con gli stessi percorsi
const URLS = GOOGLE_API_BASE
	? {
			auth: `${GOOGLE_API_BASE}/o/oauth2/v2/auth`,
			token: `${GOOGLE_API_BASE}/token`,
			revoke: `${GOOGLE_API_BASE}/revoke`,
			calendar: `${GOOGLE_API_BASE}/calendar/v3`
		}
	: {
			auth: 'https://accounts.google.com/o/oauth2/v2/auth',
			token: 'https://oauth2.googleapis.com/token',
			revoke: 'https://oauth2.googleapis.com/revoke',
			calendar: 'https://www.googleapis.com/calendar/v3'
		};

export const LOGIN_SCOPES = ['openid', 'email', 'profile'];
/** Calendario dell'app (crearlo e scriverci), elenco dei calendari, lettura degli eventi. */
export const CALENDAR_SCOPES = [
	'openid',
	'email',
	'https://www.googleapis.com/auth/calendar.app.created',
	'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
	'https://www.googleapis.com/auth/calendar.events.readonly'
];

export const googleLoginEnabled = () => !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET;
export const googleCalendarEnabled = () => googleLoginEnabled() && validTokenKey();

export const clientId = () => GOOGLE_CLIENT_ID!;

export function authUrl(input: {
	redirectUri: string;
	scopes: string[];
	state: string;
	challenge: string;
	offline: boolean;
	loginHint?: string;
}) {
	const params = new URLSearchParams({
		client_id: GOOGLE_CLIENT_ID!,
		redirect_uri: input.redirectUri,
		response_type: 'code',
		scope: input.scopes.join(' '),
		state: input.state,
		code_challenge: input.challenge,
		code_challenge_method: 'S256',
		include_granted_scopes: 'true'
	});
	// per il calendario serve il refresh token: accesso offline e consenso ogni volta
	if (input.offline) {
		params.set('access_type', 'offline');
		params.set('prompt', 'consent');
	} else params.set('prompt', 'select_account');
	if (input.loginHint) params.set('login_hint', input.loginHint);
	return `${URLS.auth}?${params}`;
}

export type TokenResponse = {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	id_token?: string;
	scope?: string;
};

export class GoogleError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

async function tokenRequest(params: Record<string, string>) {
	const response = await fetch(URLS.token, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: GOOGLE_CLIENT_ID!,
			client_secret: GOOGLE_CLIENT_SECRET!,
			...params
		})
	});
	const body = (await response.json().catch(() => ({}))) as TokenResponse & {
		error?: string;
		error_description?: string;
	};
	if (!response.ok)
		throw new GoogleError(response.status, body.error ?? `token: HTTP ${response.status}`);
	return body;
}

export const exchangeCode = (code: string, redirectUri: string, verifier: string) =>
	tokenRequest({
		grant_type: 'authorization_code',
		code,
		redirect_uri: redirectUri,
		code_verifier: verifier
	});

export const refreshAccessToken = (refreshToken: string) =>
	tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

/** Revoca l'accesso (best effort: se il token non vale più va bene lo stesso). */
export async function revokeToken(token: string) {
	await fetch(URLS.revoke, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ token })
	}).catch(() => {});
}

/** Chiamata all'API Calendar v3; null per 404/410 (risorsa che non c'è più). */
export async function calendarApi<T>(
	accessToken: string,
	method: string,
	path: string,
	options: { query?: Record<string, string | undefined>; body?: unknown } = {}
): Promise<T | null> {
	const query = Object.entries(options.query ?? {}).filter(
		(e): e is [string, string] => e[1] !== undefined
	);
	const url = `${URLS.calendar}${path}${query.length ? `?${new URLSearchParams(query)}` : ''}`;
	const response = await fetch(url, {
		method,
		headers: {
			authorization: `Bearer ${accessToken}`,
			...(options.body === undefined ? {} : { 'content-type': 'application/json' })
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		signal: AbortSignal.timeout(15_000)
	});
	if (response.status === 404 || response.status === 410) return null;
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
		throw new GoogleError(
			response.status,
			body?.error?.message ?? `Calendar: HTTP ${response.status}`
		);
	}
	return response.status === 204 ? ({} as T) : ((await response.json()) as T);
}
