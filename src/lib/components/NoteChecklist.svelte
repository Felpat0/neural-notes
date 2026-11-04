<script lang="ts">
	import { onMount } from 'svelte';
	import { ListChecks, X } from '@lucide/svelte';
	import TodoList from '#lib/components/TodoList.svelte';
	import { outbox } from '#lib/outbox.svelte.ts';
	import { sync } from '#lib/sync.svelte.ts';
	import { todoApi, type TodoItem } from '#lib/todo-api.ts';

	// Checklist dentro una nota: montata dall'editor (blocco "checklistEmbed"), carica i suoi todo.
	// Senza rete usa l'ultima copia salvata sul dispositivo (o è nuova, creata offline).
	let {
		checklistId,
		today,
		onremove
	}: { checklistId: string; today: string; onremove?: () => void } = $props();

	let items = $state<TodoItem[] | null>(null);
	let failed = $state(false);

	// todo cambiati su un altro dispositivo: la lista riparte dai dati nuovi
	let seen = sync.changes;
	$effect(() => {
		if (sync.changes === seen) return;
		seen = sync.changes;
		void todoApi<{ items: TodoItem[] }>('list', { checklistId })
			.then(({ items: fresh }) => {
				if (!outbox.idle) return;
				items = fresh;
				void outbox.saveChecklist(checklistId, fresh);
			})
			.catch(() => undefined);
	});

	onMount(async () => {
		try {
			items = (await todoApi<{ items: TodoItem[] }>('list', { checklistId })).items;
			void outbox.saveChecklist(checklistId, items);
		} catch {
			const createdHere = outbox.todoOps.some(
				(op) => op.op === 'createChecklist' && op.id === checklistId
			);
			items = (await outbox.cachedChecklist(checklistId)) ?? (createdHere ? [] : null);
			failed = !items;
		}
	});
</script>

<div class="frame-neon my-3 flex flex-col px-3.5 pt-4 pb-2 not-italic">
	<div class="flex items-center justify-between gap-2 pl-2.5">
		<span class="flex items-center gap-1.5 lbl font-bold text-neon">
			<ListChecks size={14} aria-hidden="true" /> Checklist
		</span>
		{#if onremove}
			<button
				type="button"
				class="flex size-8 items-center justify-center text-dim hover:text-alert"
				aria-label="Togli la checklist dalla nota"
				onclick={onremove}
			>
				<X size={16} aria-hidden="true" />
			</button>
		{/if}
	</div>
	{#if items}
		{#key items}
			<TodoList {items} {checklistId} day={today} {today} variant="note" />
		{/key}
	{:else if failed}
		<p class="pb-2 text-sm text-alert">Checklist non disponibile senza connessione.</p>
	{:else}
		<p class="pb-2 text-sm text-dim">Caricamento…</p>
	{/if}
</div>
