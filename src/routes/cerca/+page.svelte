<script lang="ts">
	import { Search } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { noteStamp } from '#lib/notes.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Cerca · NEURAL//NOTES</title></svelte:head>

<PageHeader title="Cerca" />

<div class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5 md:px-6">
	<form method="GET" role="search" class="flex gap-2">
		<label for="search-q" class="sr-only">Cerca nelle note</label>
		<input
			id="search-q"
			name="q"
			type="search"
			value={data.q}
			placeholder="Cerca nelle note"
			class="input flex-1"
		/>
		<button class="btn-primary w-13 px-0" aria-label="Cerca">
			<Search size={20} strokeWidth={2.5} aria-hidden="true" />
		</button>
	</form>

	{#if data.q}
		<p class="lbl text-dim" aria-live="polite">
			{data.results.length}
			{data.results.length === 1 ? 'nota' : 'note'} per "{data.q}"
		</p>
		<ul class="flex flex-col gap-2">
			{#each data.results as note (note.id)}
				<li>
					<a href="/note/{note.id}" class="note-row">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="truncate text-base font-bold uppercase"
								>{note.title || 'Senza titolo'}</span
							>
							{#if note.preview}<span class="line-clamp-2 text-sm text-dim">{note.preview}</span
								>{/if}
						</div>
						<span class="shrink-0 lbl text-dim">{noteStamp(note, data.user!.timezone)}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-[15px] text-dim">Cerca nel titolo e nel testo di tutte le note.</p>
	{/if}
</div>
