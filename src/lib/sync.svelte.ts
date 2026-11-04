// Aggiornamento automatico: si accorge delle modifiche fatte da un altro dispositivo e ricarica i
// dati della pagina. Il server dà un'impronta dei dati dell'utente (/api/sync, poche query); la si
// controlla a intervalli mentre l'app è visibile, quando torna in primo piano e quando torna la
// rete. Se è cambiata si ricaricano i dati (invalidateAll), ma solo a coda delle modifiche vuota
// (le sue invalidazioni le fa già outbox) e non mentre si scrive in un campo: le liste ripartono
// dai dati nuovi e si perderebbe il testo a metà; in quel caso si aspetta che il campo si chiuda.
import { browser } from '$app/env';
import { invalidateAll } from '$app/navigation';
import { outbox } from '#lib/outbox.svelte.ts';

const INTERVAL = 30_000;
const TIMEOUT = 10_000;

/** Si sta scrivendo in un campo (il testo delle note no: l'editor non riparte con i dati nuovi). */
function typing() {
	const el = document.activeElement;
	return !!el && el.matches('input:not([type=checkbox]):not([type=radio]), textarea, select');
}

class LiveSync {
	/** cresce a ogni modifica arrivata da altrove: chi carica i dati da sé (checklist) li ricarica */
	changes = $state(0);

	/** impronta dei dati mostrati; null: da rileggere senza ricaricare (es. dopo i nostri invii) */
	#known: string | null = null;
	/** cresce a ogni nostro invio: un controllo partito prima non ricarica per colpa nostra */
	#sent = 0;
	#started = false;
	#checking = false;
	#timer: ReturnType<typeof setInterval> | undefined;
	#later: ReturnType<typeof setTimeout> | undefined;

	start() {
		if (!browser || this.#started) return;
		this.#started = true;
		// le nostre modifiche cambiano l'impronta: diventa il nuovo riferimento, senza ricaricare
		outbox.onSent(() => {
			this.#sent++;
			this.#known = null;
			void this.check();
		});
		document.addEventListener('visibilitychange', () => this.#schedule());
		addEventListener('focus', () => void this.check());
		addEventListener('online', () => void this.check());
		// rimandata perché si scriveva: si riprova appena il campo si chiude
		document.addEventListener('focusout', () => {
			clearTimeout(this.#later);
			this.#later = setTimeout(() => void this.check(), 500);
		});
		this.#schedule();
	}

	#schedule() {
		clearInterval(this.#timer);
		if (document.visibilityState !== 'visible') return;
		void this.check();
		this.#timer = setInterval(() => void this.check(), INTERVAL);
	}

	/** Controlla l'impronta e, se è cambiata altrove, ricarica i dati. */
	async check() {
		if (this.#checking || !navigator.onLine || document.visibilityState !== 'visible') return;
		if (!outbox.idle || outbox.authError) return;
		this.#checking = true;
		const sent = this.#sent;
		try {
			const v = await this.#fetch();
			if (v === null || !outbox.idle) return;
			// nostri invii durante la richiesta: si rilegge al prossimo giro
			if (sent !== this.#sent) return void (this.#known = null);
			if (this.#known === null) {
				this.#known = v;
				return;
			}
			if (v === this.#known || typing()) return;
			this.#known = v;
			await invalidateAll();
			this.changes++;
		} finally {
			this.#checking = false;
			if (sent !== this.#sent) void this.check();
		}
	}

	async #fetch(): Promise<string | null> {
		const abort = new AbortController();
		const timer = setTimeout(() => abort.abort(), TIMEOUT);
		try {
			const res = await fetch('/api/sync', { signal: abort.signal, cache: 'no-store' });
			if (!res.ok) return null;
			return ((await res.json()) as { v: string }).v;
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
		}
	}
}

export const sync = new LiveSync();
