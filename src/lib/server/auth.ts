// Account, sessioni, link monouso via email e limite ai tentativi.
// Nel cookie c'è un token casuale; nel database solo il suo hash, così una copia del
// database non basta per entrare. Le sessioni si possono revocare.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { and, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import { dev } from '$app/env';
import { SIGNUP_CODE, SIGNUP_MODE } from '$app/env/private';
import { db, schema as s } from './db/index.ts';
import type { AuthTokenKind } from './db/schema.ts';
import { hashPassword } from './password.ts';

export const SESSION_COOKIE = 'nn_session';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** "Resta collegato": 60 giorni rinnovati a ogni uso. */
export const REMEMBER_DAYS = 60;
/** Senza "Resta collegato": cookie di sessione del browser e 12 ore dall'ultimo uso. */
const SHORT_SESSION_MS = 12 * HOUR;

export type User = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	isAdmin: boolean;
	timezone: string;
	hasPassword: boolean;
};

export const toUser = (row: typeof s.user.$inferSelect): User => ({
	id: row.id,
	name: row.name,
	email: row.email,
	emailVerified: !!row.emailVerifiedAt,
	isAdmin: row.isAdmin,
	timezone: row.timezone,
	hasPassword: !!row.passwordHash
});

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) =>
	email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Solo percorsi interni, per i redirect dopo l'accesso. */
export const safeNext = (next: string | null | undefined) =>
	next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';

export function validTimezone(tz: string) {
	try {
		new Intl.DateTimeFormat('it', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

// --- Registrazione ---

export const signupOpen = () => SIGNUP_MODE !== 'closed';
export const signupNeedsCode = () => !!SIGNUP_CODE;

export function checkSignupCode(input: string) {
	if (!SIGNUP_CODE) return true;
	const a = Buffer.from(input.trim());
	const b = Buffer.from(SIGNUP_CODE);
	return a.length === b.length && timingSafeEqual(a, b);
}

// --- Utenti ---

export async function createUser(input: {
	name: string;
	email: string;
	password: string;
	timezone?: string;
}) {
	const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.user);
	const [row] = await db
		.insert(s.user)
		.values({
			id: randomUUID(),
			name: input.name.trim(),
			email: normalizeEmail(input.email),
			passwordHash: await hashPassword(input.password),
			timezone: input.timezone && validTimezone(input.timezone) ? input.timezone : 'Europe/Rome',
			// il primo account gestisce le impostazioni globali
			isAdmin: n === 0
		})
		.onConflictDoNothing({ target: s.user.email })
		.returning();
	return row ? toUser(row) : null;
}

export async function findUserByEmail(email: string) {
	const [row] = await db
		.select()
		.from(s.user)
		.where(eq(s.user.email, normalizeEmail(email)));
	return row ?? null;
}

export async function getUser(id: string) {
	const [row] = await db.select().from(s.user).where(eq(s.user.id, id));
	return row ?? null;
}

// --- Sessioni ---

export async function startSession(
	cookies: Cookies,
	userId: string,
	userAgent: string | null,
	remember = true
) {
	const token = newToken();
	await db.insert(s.session).values({
		id: hashToken(token),
		userId,
		userAgent: userAgent?.slice(0, 300) ?? null,
		remember,
		expiresAt: new Date(Date.now() + (remember ? REMEMBER_DAYS * DAY : SHORT_SESSION_MS))
	});
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		// senza maxAge il browser lo cancella alla chiusura
		...(remember ? { maxAge: REMEMBER_DAYS * 24 * 60 * 60 } : {})
	});
}

/** Utente della sessione, o null. Rinnova la scadenza (al massimo una volta al giorno o all'ora). */
export async function readSession(token: string | undefined) {
	if (!token) return null;
	const id = hashToken(token);
	const [row] = await db
		.select({ session: s.session, user: s.user })
		.from(s.session)
		.innerJoin(s.user, eq(s.session.userId, s.user.id))
		.where(and(eq(s.session.id, id), gt(s.session.expiresAt, new Date())));
	if (!row) return null;
	const { remember, lastSeenAt } = row.session;
	if (Date.now() - lastSeenAt.getTime() > (remember ? DAY : HOUR)) {
		await db
			.update(s.session)
			.set({
				lastSeenAt: new Date(),
				expiresAt: new Date(Date.now() + (remember ? REMEMBER_DAYS * DAY : SHORT_SESSION_MS))
			})
			.where(eq(s.session.id, id));
	}
	return { sessionId: id, user: toUser(row.user) };
}

export async function endSession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(s.session).where(eq(s.session.id, hashToken(token)));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** Esce da tutti gli altri dispositivi (o da tutti, senza `keep`). */
export async function endOtherSessions(userId: string, keep?: string) {
	await db
		.delete(s.session)
		.where(and(eq(s.session.userId, userId), keep ? ne(s.session.id, keep) : undefined));
}

export const purgeExpiredSessions = () =>
	db.delete(s.session).where(lt(s.session.expiresAt, new Date()));

// --- Link monouso via email: conferma dell'indirizzo e nuova password ---

export const TOKEN_TTL: Record<AuthTokenKind, number> = { verify: DAY, reset: HOUR };

/** Crea un link nuovo e annulla quelli ancora validi dello stesso tipo. */
export async function createAuthToken(userId: string, kind: AuthTokenKind) {
	const token = newToken();
	await db
		.delete(s.authToken)
		.where(
			and(eq(s.authToken.userId, userId), eq(s.authToken.kind, kind), isNull(s.authToken.usedAt))
		);
	await db.insert(s.authToken).values({
		id: randomUUID(),
		userId,
		kind,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + TOKEN_TTL[kind])
	});
	return token;
}

/** Link ancora valido con il suo utente, o null (sconosciuto, scaduto o già usato). */
export async function readAuthToken(token: string, kind: AuthTokenKind) {
	const [row] = await db
		.select({ token: s.authToken, user: s.user })
		.from(s.authToken)
		.innerJoin(s.user, eq(s.authToken.userId, s.user.id))
		.where(
			and(
				eq(s.authToken.tokenHash, hashToken(token)),
				eq(s.authToken.kind, kind),
				isNull(s.authToken.usedAt),
				gt(s.authToken.expiresAt, new Date())
			)
		);
	return row ?? null;
}

/** Segna il link come usato; false se nel frattempo lo era già (doppio invio). */
export async function consumeAuthToken(id: string) {
	const used = await db
		.update(s.authToken)
		.set({ usedAt: new Date() })
		.where(and(eq(s.authToken.id, id), isNull(s.authToken.usedAt)))
		.returning({ id: s.authToken.id });
	return used.length > 0;
}

export const markEmailVerified = (userId: string) =>
	db.update(s.user).set({ emailVerifiedAt: new Date() }).where(eq(s.user.id, userId));

export async function setPassword(userId: string, password: string) {
	await db
		.update(s.user)
		.set({ passwordHash: await hashPassword(password) })
		.where(eq(s.user.id, userId));
}

// --- Limite ai tentativi: di default 10 ogni 15 minuti per chiave ---

type Limit = { max: number; windowMs: number };
const LOGIN_LIMIT: Limit = { max: 10, windowMs: 15 * 60 * 1000 };

export async function tooManyAttempts(keys: string[], limit: Limit = LOGIN_LIMIT) {
	const since = new Date(Date.now() - limit.windowMs);
	for (const key of keys) {
		const [row] = await db.select().from(s.authAttempt).where(eq(s.authAttempt.key, key));
		if (row && row.windowStart > since && row.failures >= limit.max) return true;
	}
	return false;
}

/** Conta un tentativo (sbagliato, o una richiesta da limitare come le email di reset). */
export async function recordFailure(keys: string[], limit: Limit = LOGIN_LIMIT) {
	const since = new Date(Date.now() - limit.windowMs);
	for (const key of keys) {
		await db
			.insert(s.authAttempt)
			.values({ key, failures: 1, windowStart: new Date() })
			.onConflictDoUpdate({
				target: s.authAttempt.key,
				set: {
					failures: sql`case when ${s.authAttempt.windowStart} > ${since.toISOString()}::timestamptz then ${s.authAttempt.failures} + 1 else 1 end`,
					windowStart: sql`case when ${s.authAttempt.windowStart} > ${since.toISOString()}::timestamptz then ${s.authAttempt.windowStart} else now() end`
				}
			});
	}
}

export const clearFailures = (keys: string[]) =>
	Promise.all(keys.map((key) => db.delete(s.authAttempt).where(eq(s.authAttempt.key, key))));

/** Email di reset e di conferma: 5 all'ora per indirizzo e per IP. */
export const MAIL_LIMIT: Limit = { max: 5, windowMs: HOUR };
