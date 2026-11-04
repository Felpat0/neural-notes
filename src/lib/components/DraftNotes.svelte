<script lang="ts">
	import { CloudOff } from '@lucide/svelte';
	import { outbox } from '#lib/outbox.svelte.ts';

	// Note create offline e non ancora sul server: negli elenchi non ci sono ancora, si aprono da qui.
</script>

{#if outbox.drafts.length}
	<section aria-labelledby="drafts-title" class="flex flex-col gap-2">
		<h2 id="drafts-title" class="sep">
			Da inviare <span class="text-[11px]">{outbox.drafts.length}</span>
		</h2>
		{#each outbox.drafts as draft (draft.id)}
			<a href="/bozza/{draft.id}" class="note-row">
				<span class="flex min-w-0 flex-1 items-center gap-1.5 text-base font-bold uppercase">
					<CloudOff size={14} class="shrink-0 text-soft" aria-label="Non ancora inviata" />
					<span class="truncate">{draft.title || 'Senza titolo'}</span>
				</span>
			</a>
		{/each}
	</section>
{/if}
