// Token di Google nel DB cifrati con AES-256-GCM (chiave GOOGLE_TOKEN_KEY): "iv.tag.dati" in base64url.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { GOOGLE_TOKEN_KEY } from '$app/env/private';

function key() {
	const raw = Buffer.from(GOOGLE_TOKEN_KEY ?? '', 'base64');
	if (raw.length !== 32) throw new Error('GOOGLE_TOKEN_KEY deve essere di 32 byte in base64');
	return raw;
}

export const validTokenKey = () => {
	try {
		return key().length === 32;
	} catch {
		return false;
	}
};

export function encrypt(text: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(value: string) {
	const [iv, tag, data] = value.split('.').map((p) => Buffer.from(p, 'base64url'));
	const decipher = createDecipheriv('aes-256-gcm', key(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Token dei canali di notifica di Google: legato all'id del canale, verificato dal webhook. */
export const channelToken = (channelId: string) =>
	createHmac('sha256', key()).update(`channel:${channelId}`).digest('base64url');
