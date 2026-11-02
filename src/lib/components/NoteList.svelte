<script lang="ts">
	import { Plus, Search, X } from '@lucide/svelte';
	import NoteGroups from '#lib/components/NoteGroups.svelte';
	import type { NoteGroup } from '#lib/notes.ts';
	import { editQuery } from '#lib/url.ts';

	let {
		groups,
		tags,
		q,
		tag,
		months,
		older,
		timezone,
		activeId
	}: {
		groups: NoteGroup[];
		tags: string[];
		q: string;
		tag: string;
		months: number;
		older: boolean;
		timezone: string;
		activeId?: string;
	} = $props();

	/** Indirizzo dell'elenco con i filtri attuali cambiati. */
	const listHref = (change: Record<string, string | number | null>) =>
		`/note${editQuery('', { q, tag, ...change })}`;
	// aprendo una nota restano ricerca e tag, per tornare allo stesso elenco
	const noteHref = (id: string) => `/note/${id}${editQuery('', { q, tag })}`;
	const empty = $derived(groups.length === 0);
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-2">
		<h1 class="text-[32px] leading-none font-bold text-volt uppercase">Note</h1>
		<form method="POST" action="/note?/create">
			<button class="btn-primary size-11 min-h-0 p-0" aria-label="Nuova nota">
				<Plus size={22} strokeWidth={3} aria-hidden="true" />
			</button>
		</form>
	</div>

	<form
		method="GET"
		action="/note"
		class="flex items-center gap-2 border border-field px-3"
		role="search"
	>
		<Search size={18} class="text-volt" aria-hidden="true" />
		<label for="note-q" class="sr-only">Cerca nelle note</label>
		<input
			id="note-q"
			name="q"
			type="search"
			value={q}
			placeholder="Cerca nelle note"
			class="h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-white placeholder:text-dim focus:ring-0"
		/>
		{#if tag}<input type="hidden" name="tag" value={tag} />{/if}
		{#if q}
			<a
				href={listHref({ q: null })}
				aria-label="Cancella ricerca"
				class="flex size-9 items-center justify-center text-dim"
			>
				<X size={18} aria-hidden="true" />
			</a>
		{/if}
	</form>

	{#if tags.length}
		<nav aria-label="Filtra per tag" class="flex flex-wrap gap-1.5">
			<a
				href={listHref({ tag: null })}
				class="px-2 py-1.5 lbl font-bold {tag
					? 'border border-field text-dim'
					: 'bg-volt text-void'}"
				aria-current={tag ? undefined : 'page'}>Tutte</a
			>
			{#each tags as t (t)}
				<a
					href={listHref({ tag: t === tag ? null : t })}
					class="px-2 py-1.5 text-xs font-bold {t === tag
						? 'bg-volt text-void'
						: 'border border-field text-dim hover:text-volt'}"
					aria-current={t === tag ? 'page' : undefined}>#{t}</a
				>
			{/each}
		</nav>
	{/if}

	{#if empty}
		<p class="border border-field px-3.5 py-4 text-[15px] text-dim">
			{#if q}
				Nessuna nota contiene "{q}".
			{:else if tag}
				Nessuna nota con #{tag}.
			{:else}
				Ancora nessuna nota. Creane una con il pulsante +.
			{/if}
		</p>
	{/if}

	<NoteGroups
		{groups}
		{timezone}
		{noteHref}
		{activeId}
		olderHref={older ? listHref({ mesi: months + 3 }) : null}
		sticky
	/>
</div>
