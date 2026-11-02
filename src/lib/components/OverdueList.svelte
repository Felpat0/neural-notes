<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { ArrowRight } from '@lucide/svelte';
	import { dayNumber, monthShort, weekdayShort } from '#lib/format.ts';
	import { todoApi } from '#lib/todo-api.ts';

	// "In sospeso": todo non fatti dei giorni passati, da portare a oggi uno per uno o tutti.
	let { items, today }: { items: { id: string; text: string; day: string }[]; today: string } =
		$props();

	let list = $state(untrack(() => [...items]));
	let busy = $state(false);
	let error = $state('');

	async function bring(ids: string[]) {
		const previous = list;
		list = list.filter((t) => !ids.includes(t.id));
		busy = true;
		error = '';
		try {
			await todoApi('moveMany', { ids, day: today });
			// la lista del giorno si ricarica con i todo portati qui
			await invalidate('app:home');
		} catch (e) {
			list = previous;
			error = `Non spostati: ${(e as Error).message}`;
		} finally {
			busy = false;
		}
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
				<button
					class="btn-link lbl text-[11px]"
					disabled={busy}
					onclick={() => bring(list.map((t) => t.id))}
				>
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
						disabled={busy}
						aria-label="Porta a oggi: {todo.text}"
						onclick={() => bring([todo.id])}
					>
						Oggi <ArrowRight size={14} aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
		{#if error}<p class="text-sm font-semibold" role="alert">{error}</p>{/if}
	</section>
{/if}
