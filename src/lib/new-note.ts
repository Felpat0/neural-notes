// "Nuova nota": l'id lo sceglie il dispositivo, così si può creare anche offline. Con la rete si
// aspetta il server e si apre la nota normale; senza, si apre la bozza (/bozza/<id>), che si
// salva nella coda e arriva sul server quando torna la connessione.
import { goto } from '$app/navigation';
import { newId, outbox } from '#lib/outbox.svelte.ts';

let busy = false;

/** Per l'onsubmit dei form "Nuova nota" (che senza JavaScript usano l'azione /note?/create). */
export function newNote(day: string | null = null) {
	return async (event: SubmitEvent) => {
		event.preventDefault();
		if (busy) return;
		busy = true;
		try {
			const id = newId();
			const sent = outbox.createNote(id, day);
			const outcome = navigator.onLine
				? await Promise.race([sent, new Promise<null>((r) => setTimeout(() => r(null), 4000))])
				: null;
			await goto(outcome?.ok ? `/note/${id}` : `/bozza/${id}`);
		} finally {
			busy = false;
		}
	};
}
