// File degli allegati: Vercel Blob con accesso privato (si leggono solo dal server, che controlla
// a chi appartengono). In sviluppo, senza token, una cartella locale (.attachments/).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { del, get, put } from '@vercel/blob';
import { dev } from '$app/env';
import { BLOB_READ_WRITE_TOKEN } from '$app/env/private';

const LOCAL_DIR = resolve('.attachments');

export const storageEnabled = () => !!BLOB_READ_WRITE_TOKEN || dev;

/** Percorso locale dentro la cartella degli allegati (le chiavi le crea il server, ma per sicurezza). */
function localPath(key: string) {
	const path = resolve(join(LOCAL_DIR, key));
	if (!path.startsWith(LOCAL_DIR)) throw new Error('Percorso non valido');
	return path;
}

export async function putFile(key: string, data: Uint8Array, mime: string) {
	if (BLOB_READ_WRITE_TOKEN) {
		await put(key, Buffer.from(data), {
			access: 'private',
			contentType: mime,
			addRandomSuffix: false,
			allowOverwrite: true,
			token: BLOB_READ_WRITE_TOKEN
		});
		return;
	}
	if (!dev) throw new Error('Storage degli allegati non configurato (BLOB_READ_WRITE_TOKEN)');
	const path = localPath(key);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, data);
}

/** Contenuto del file, o null se non c'è. */
export async function readFileBytes(key: string): Promise<Uint8Array | null> {
	if (BLOB_READ_WRITE_TOKEN) {
		const result = await get(key, { access: 'private', token: BLOB_READ_WRITE_TOKEN });
		if (!result?.stream) return null;
		return new Uint8Array(await new Response(result.stream).arrayBuffer());
	}
	if (!dev) return null;
	return readFile(localPath(key)).catch(() => null);
}

export async function deleteFiles(keys: string[]) {
	if (!keys.length) return;
	if (BLOB_READ_WRITE_TOKEN) {
		await del(keys, { token: BLOB_READ_WRITE_TOKEN });
		return;
	}
	if (dev) await Promise.all(keys.map((k) => rm(localPath(k), { force: true })));
}
