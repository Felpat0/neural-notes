<script lang="ts">
	import { page } from '$app/state';
	import { FileText } from '@lucide/svelte';

	// dopo l'eliminazione si torna qui con ?eliminata=<id>, per poterla ripristinare
	const deleted = $derived(page.url.searchParams.get('eliminata'));
</script>

<svelte:head><title>Note · NEURAL//NOTES</title></svelte:head>

{#if deleted}
	<div
		role="status"
		class="fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex min-h-13 items-center justify-between gap-3 bg-ink py-1.5 pr-1.5 pl-3.5 text-void cut md:right-auto md:bottom-6 md:left-[calc(76px+1.5rem)] md:w-96"
	>
		<span class="font-bold">Nota eliminata</span>
		<form method="POST" action="?/restore">
			<input type="hidden" name="id" value={deleted} />
			<button class="h-10 bg-void px-3 lbl font-bold text-volt">Annulla</button>
		</form>
	</div>
{/if}

<div
	class="hidden h-full min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center text-dim md:flex"
>
	<FileText size={40} class="text-field" aria-hidden="true" />
	<p class="text-[15px]">Scegli una nota dall'elenco o creane una nuova.</p>
</div>
