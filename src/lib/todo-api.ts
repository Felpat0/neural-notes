// Tipi dei todo e chiamate a /api/todo dall'interfaccia. Errore = eccezione con il messaggio del server.
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

export async function todoApi<T = unknown>(op: string, data: Record<string, unknown>): Promise<T> {
	const res = await fetch('/api/todo', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ op, ...data })
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { message?: string } | null;
		throw new Error(body?.message ?? `Errore ${res.status}`);
	}
	return res.json() as Promise<T>;
}
