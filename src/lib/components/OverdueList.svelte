<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import { dayNumber, monthShort, weekdayShort } from '#lib/format.ts';
	import { handledTodoIds } from '#lib/outbox-ops.ts';
	import { newId, outbox } from '#lib/outbox.svelte.ts';

	// "In sospeso": todo non fatti dei giorni passati, da portare a oggi uno per uno o tutti.
	// Passano dalla coda offline: la lista di oggi li vede arrivare subito, anche senza rete.
	let {
		items,
		today
	}: {
		items: { id: string; text: string; ruleId: string | null; day: string }[];
		today: string;
	} = $props();

	// non si mostrano quelli portati via da qui e quelli spostati, eliminati o fatti con
	// modifiche ancora in coda (i dati possono venire dalla cache)
	let gone = $state<string[]>([]);
	const handled = $derived(handledTodoIds(outbox.todoOps));
	const list = $derived(items.filter((t) => !handled.has(t.id) && !gone.includes(t.id)));

	function bring(todos: typeof items) {
		gone = [...gone, ...todos.map((t) => t.id)];
		// un ricorrente spostato diventa un todo nuovo: l'id lo sceglie già qui
		const newIds = todos.map((t) => (t.ruleId ? newId() : null));
		void outbox.todo({
			op: 'moveMany',
			ids: todos.map((t) => t.id),
			newIds,
			day: today,
			items: todos.map((t) => ({
				id: t.id,
				text: t.text,
				done: false,
				ruleId: t.ruleId,
				repeat: null,
				time: null
			}))
		});
	}
</script>

{#if list.length}
	<section
		aria-labelledby="overdue-title"
		class="flex flex-col gap-1 panel-top px-3.5 pt-2.5 pb-2 text-alert"
	>
		<div class="flex items-center justify-between gap-2">
			<h2 id="overdue-title" class="lbl font-bold">In sospeso · {list.length}</h2>
			{#if list.length > 1}
				<button class="btn-link lbl text-[11px]" onclick={() => bring(list)}>
					Porta tutti a oggi
				</button>
			{/if}
		</div>
		<ul class="flex flex-col">
			{#each list as todo (todo.id)}
				<li class="flex min-h-11 items-center gap-3 border-t border-line text-ink first:border-0">
					<span class="w-16 shrink-0 lbl text-[10px] text-dim">
						{weekdayShort(todo.day)}
						{Number(dayNumber(todo.day))}
						{monthShort(todo.day)}
					</span>
					<span class="min-w-0 flex-1 wrap-break-word">{todo.text}</span>
					<button
						class="flex h-9 shrink-0 items-center gap-1 border border-neon px-2 lbl font-bold text-neon"
						aria-label="Porta a oggi: {todo.text}"
						onclick={() => bring([todo])}
					>
						Oggi <ArrowRight size={14} aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}
