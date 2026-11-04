// Tipi dei todo e letture da /api/todo. Errore = eccezione con il messaggio del server.
import type { Repeat } from '#lib/repeat.ts';

export type TodoItem = {
	id: string;
	text: string;
	done: boolean;
	ruleId: string | null;
	repeat: Repeat | null;
	/** ora del promemoria (HH:MM, nel fuso dell'utente), se c'è */
	time: string | null;
};

export const MAX_TODO_LENGTH = 500;

/**
 * Letture (es. 'list'). Le modifiche passano dalla coda offline (outbox.todo), che le invia in
 * ordine anche quando la rete torna dopo. Con una rete che non risponde si rinuncia dopo 8 secondi.
 */
export async function todoApi<T = unknown>(op: string, data: Record<string, unknown>): Promise<T> {
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), 8000);
	const res = await fetch('/api/todo', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ op, ...data }),
		signal: abort.signal
	}).finally(() => clearTimeout(timer));
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { message?: string } | null;
		throw new Error(body?.message ?? `Errore ${res.status}`);
	}
	return res.json() as Promise<T>;
}
