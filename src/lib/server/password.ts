// Password con scrypt (node:crypto): formato "scrypt$N$r$p$sale$hash", tutto in base64url.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
	new Promise<Buffer>((resolve, reject) =>
		scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) =>
			err ? reject(err) : resolve(key)
		)
	);

export async function hashPassword(password: string) {
	const salt = randomBytes(16);
	const key = await derive(password, salt, { N, r: R, p: P });
	return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

// Hash di una password qualsiasi: per un'email sconosciuta si fa lo stesso lavoro,
// così il tempo di risposta non rivela se l'account esiste.
const DUMMY_HASH = hashPassword('nessun-account-con-questa-email');

export async function verifyPassword(password: string, stored: string | null) {
	const [algo, n, r, p, salt, hash] = (stored ?? (await DUMMY_HASH)).split('$');
	if (algo !== 'scrypt' || !salt || !hash) return false;
	const expected = Buffer.from(hash, 'base64url');
	const key = await derive(password, Buffer.from(salt, 'base64url'), {
		N: Number(n),
		r: Number(r),
		p: Number(p)
	});
	return !!stored && key.length === expected.length && timingSafeEqual(key, expected);
}

export { passwordProblem } from '#lib/password-rules.ts';
