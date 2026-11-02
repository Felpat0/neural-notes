<script lang="ts">
	import { Pin } from '@lucide/svelte';
	import { dayNumber, monthShort, weekdayShort } from '#lib/format.ts';
	import { noteStamp, type NoteGroup } from '#lib/notes.ts';

	// Note raggruppate per periodo (fascia gialla per gruppo), nell'elenco delle note e nella home.
	let {
		groups,
		timezone,
		noteHref = (id: string) => `/note/${id}`,
		olderHref = null,
		activeId,
		sticky = false
	}: {
		groups: NoteGroup[];
		timezone: string;
		noteHref?: (id: string) => string;
		/** link "Mesi precedenti", se ce ne sono */
		olderHref?: string | null;
		activeId?: string;
		/** fasce ferme in cima mentre si scorre (elenco a pannello) */
		sticky?: boolean;
	} = $props();
</script>

{#each groups as group (group.key)}
	<section aria-labelledby="g-{group.key}" class="flex flex-col gap-2">
		<h2 id="g-{group.key}" class="sep {sticky ? 'sticky top-0 z-10' : ''}">
			{group.label} <span class="text-[11px]">{group.notes.length}</span>
		</h2>
		{#each group.notes as note (note.id)}
			<a
				href={noteHref(note.id)}
				class="note-row"
				aria-current={note.id === activeId ? 'page' : undefined}
				data-sveltekit-preload-data="tap"
			>
				<div class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="flex items-center gap-1.5 text-base font-bold uppercase">
						{#if note.pinned}<Pin size={14} class="shrink-0 text-volt" aria-label="Fissata" />{/if}
						<span class="truncate">{note.title || 'Senza titolo'}</span>
					</span>
					{#if note.preview}
						<span class="line-clamp-2 text-sm text-dim">{note.preview}</span>
					{/if}
					{#if note.day || note.tags.length}
						<span class="flex flex-wrap gap-x-2 lbl text-[10px]">
							{#if note.day}<span class="text-neon"
									>{weekdayShort(note.day)} {dayNumber(note.day)} {monthShort(note.day)}</span
								>{/if}
							{#each note.tags as t (t)}<span class="text-soft">#{t}</span>{/each}
						</span>
					{/if}
				</div>
				<span class="shrink-0 lbl text-dim">{noteStamp(note, timezone)}</span>
			</a>
		{/each}
	</section>
{/each}

{#if olderHref}
	<a href={olderHref} class="btn-outline cut">Mesi precedenti</a>
{/if}
