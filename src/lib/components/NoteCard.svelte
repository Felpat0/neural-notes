<script lang="ts">
	import { onMount } from 'svelte';
	import { ListChecks, Pin } from '@lucide/svelte';
	import TodoList from '#lib/components/TodoList.svelte';
	import { dayNumber } from '#lib/format.ts';
	import { outbox } from '#lib/outbox.svelte.ts';
	import type { TodoItem } from '#lib/todo-api.ts';

	// Nota assegnata al giorno, nella home: titolo, inizio del testo e le sue checklist,
	// che si spuntano e si modificano qui senza aprire la nota.
	let {
		note,
		today
	}: {
		note: {
			id: string;
			title: string;
			preview: string;
			tags: string[];
			pinned: boolean;
			/** prossimo promemoria, "AAAA-MM-GGTHH:MM" */
			reminder: string | null;
			checklists: { id: string; items: TodoItem[] }[];
		};
		today: string;
	} = $props();

	// copia sul dispositivo delle checklist: aprendo la nota senza rete si vedono lo stesso
	onMount(() => {
		if (navigator.onLine)
			for (const checklist of note.checklists)
				void outbox.saveChecklist(checklist.id, checklist.items);
	});
</script>

<article class="frame-neon flex flex-col gap-1.5 px-3.5 pt-4 pb-2" aria-labelledby="card-{note.id}">
	<a href="/note/{note.id}" class="flex flex-col gap-1 pl-2.5 text-white hover:text-volt">
		<span
			id="card-{note.id}"
			class="flex items-center gap-1.5 text-xl leading-tight font-bold uppercase"
		>
			{#if note.pinned}<Pin size={16} class="shrink-0 text-volt" aria-label="Fissata" />{/if}
			<span class="flex-1">{note.title || 'Senza titolo'}</span>
			{#if note.reminder}
				<span class="chip min-h-7 shrink-0 px-2 text-alert" title="Promemoria">
					◷ {note.reminder.slice(0, 10) === today
						? note.reminder.slice(11, 16)
						: `${dayNumber(note.reminder)}/${note.reminder.slice(5, 7)} ${note.reminder.slice(11, 16)}`}
				</span>
			{/if}
		</span>
		{#if note.preview}
			<span class="line-clamp-3 text-sm leading-relaxed text-dim">{note.preview}</span>
		{/if}
		{#if note.tags.length}
			<span class="flex flex-wrap gap-x-2 lbl text-[10px] text-soft">
				{#each note.tags as tag (tag)}<span>#{tag}</span>{/each}
			</span>
		{/if}
	</a>
	{#each note.checklists as checklist (checklist.id)}
		<div class="mt-1 flex flex-col border-t border-line pt-2">
			<span class="flex items-center gap-1.5 pl-2.5 lbl font-bold text-neon">
				<ListChecks size={14} aria-hidden="true" /> Checklist
			</span>
			{#key checklist}
				<TodoList
					items={checklist.items}
					checklistId={checklist.id}
					day={today}
					{today}
					variant="note"
				/>
			{/key}
		</div>
	{/each}
</article>
