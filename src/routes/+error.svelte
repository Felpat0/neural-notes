<script lang="ts">
	import { page } from '$app/state';
	import { CloudOff } from '@lucide/svelte';
	import { outbox } from '#lib/outbox.svelte.ts';

	// Senza rete si aprono solo le pagine già viste (salvate dal service worker): per le altre
	// SvelteKit arriva qui, e lo si spiega invece di mostrare un errore generico.
	const offline = $derived(
		!outbox.online || (typeof navigator !== 'undefined' && !navigator.onLine)
	);
</script>

<svelte:head><title>{offline ? 'Offline' : 'Errore'} · NEURAL//NOTES</title></svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
	{#if offline}
		<CloudOff size={40} class="text-volt" aria-hidden="true" />
		<h1 class="text-2xl font-bold text-volt uppercase">Sei offline</h1>
		<p class="max-w-sm text-[15px] text-dim">
			Questa pagina non è ancora salvata sul dispositivo. Si apriranno quelle già viste; le
			modifiche restano in coda e partono quando torna la connessione.
		</p>
	{:else}
		<h1 class="text-2xl font-bold text-volt uppercase">Errore {page.status}</h1>
		<p class="max-w-sm text-[15px] text-dim">{page.error?.message}</p>
	{/if}
	<a href="/" class="btn-primary">Torna a Oggi</a>
</div>
