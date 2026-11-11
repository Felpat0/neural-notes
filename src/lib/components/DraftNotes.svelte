<script lang="ts">
	import { CloudOff, Mic } from '@lucide/svelte';
	import { outbox } from '#lib/outbox.svelte.ts';

	// Note create offline e non ancora sul server: negli elenchi non ci sono ancora, si aprono da qui.
	// Le note vocali restano qui finché l'audio non è arrivato e trascritto.
</script>

{#if outbox.drafts.length}
	<section aria-labelledby="drafts-title" class="flex flex-col gap-2">
		<h2 id="drafts-title" class="sep">
			Da inviare <span class="text-[11px]">{outbox.drafts.length}</span>
		</h2>
		{#each outbox.drafts as draft (draft.id)}
			<a href="/bozza/{draft.id}" class="note-row">
				<span class="flex min-w-0 flex-1 items-center gap-1.5 text-base font-bold uppercase">
					{#if draft.voice}
						<Mic size={14} class="shrink-0 text-alert" aria-label="Nota vocale" />
					{:else}
						<CloudOff size={14} class="shrink-0 text-soft" aria-label="Non ancora inviata" />
					{/if}
					<span class="truncate">
						{draft.title || (draft.voice ? 'Nota vocale' : 'Senza titolo')}
					</span>
					{#if draft.voice}
						<span class="ml-auto shrink-0 lbl text-[10px] font-normal text-dim">
							{outbox.online ? 'Trascrizione…' : 'In attesa di rete'}
						</span>
					{/if}
				</span>
			</a>
		{/each}
	</section>
{/if}
