import { json } from '@sveltejs/kit';
import { fingerprint } from '#lib/server/sync.ts';
import type { RequestHandler } from './$types';

/** Impronta dei dati dell'utente, per accorgersi delle modifiche fatte da un altro dispositivo. */
export const GET: RequestHandler = async ({ locals }) =>
	json({ v: await fingerprint(locals.user!.id) }, { headers: { 'cache-control': 'no-store' } });
