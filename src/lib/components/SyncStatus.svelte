<script lang="ts">
	import { onMount } from 'svelte';
	import { CloudOff, RefreshCw } from '@lucide/svelte';
	import { outbox } from '#lib/outbox.svelte.ts';

	// Stato della connessione e della coda offline, in cima allo schermo; avvisi in basso.
	const count = $derived(outbox.entries.length);
	// "Invio…" solo se dura: le modifiche normali partono subito e non serve vederlo
	let slow = $state(false);
	$effect(() => {
		if (!count || !outbox.online) return void (slow = false);
		const timer = setTimeout(() => (slow = true), 2500);
		return () => clearTimeout(timer);
	});

	// Offline, i form che vanno al server (profilo, impostazioni…) non partono: lo si dice subito
	// invece di finire sulla pagina d'errore del browser. Quelli che funzionano offline hanno
	// data-offline.
	onMount(() => {
		const guard = (event: SubmitEvent) => {
			const form = event.target as HTMLFormElement;
			if (navigator.onLine || form.method !== 'post' || form.hasAttribute('data-offline')) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			outbox.notify('Serve la connessione per questa operazione');
		};
		document.addEventListener('submit', guard, true);
		return () => document.removeEventListener('submit', guard, true);
	});
</script>

{#if !outbox.online || outbox.authError || slow}
	<div
		role="status"
		class="pointer-events-none fixed top-[env(safe-area-inset-top)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 bg-ink px-2.5 py-1 lbl text-[10px] font-bold text-void cut"
	>
		{#if outbox.authError}
			<a href="/login" class="pointer-events-auto underline">
				Accedi di nuovo per inviare {count}
				{count === 1 ? 'modifica' : 'modifiche'}
			</a>
		{:else if !outbox.online}
			<CloudOff size={12} aria-hidden="true" />
			Offline{#if count}&nbsp;· {count} in coda{/if}
		{:else}
			<RefreshCw size={12} class="animate-spin" aria-hidden="true" />
			Invio {count}
			{count === 1 ? 'modifica' : 'modifiche'}…
		{/if}
	</div>
{/if}

<!-- l'ultimo avviso (uno sopra l'altro non si leggerebbero) -->
{#if outbox.notices.length}
	<div
		role="alert"
		class="fixed inset-x-4 top-[calc(36px+env(safe-area-inset-top))] z-40 bg-alert px-3.5 py-2.5 font-bold text-void cut md:right-auto md:left-25 md:w-96"
	>
		{outbox.notices[outbox.notices.length - 1].message}
	</div>
{/if}
