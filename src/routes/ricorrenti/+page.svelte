<script lang="ts">
	import { enhance } from '$app/forms';
	import { Repeat } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { dayNumber, monthShort } from '#lib/format.ts';
	import { repeatLabel } from '#lib/repeat.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Ricorrenti · NEURAL//NOTES</title></svelte:head>

<PageHeader title="Ricorrenti" back={{ href: '/', label: 'Torna a Oggi' }} />

<div class="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5 md:px-6">
	<p class="text-[15px] leading-relaxed text-soft">
		Compaiono da soli nella lista dei giorni giusti. Per crearne uno scrivi per esempio "ogni
		lunedì" nell'aggiunta rapida, o usa "Ripeti" modificando un todo.
	</p>

	{#if data.rules.length}
		<ul class="flex flex-col gap-2">
			{#each data.rules as rule (rule.id)}
				<li class="note-row items-center">
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="font-bold break-words">{rule.text}</span>
						<span class="flex flex-wrap gap-x-2 lbl text-[10px] text-dim">
							<span class="text-soft">↻ {repeatLabel(rule.repeat)}</span>
							{#if rule.time}<span class="text-alert">◷ {rule.time}</span>{/if}
							<span>dal {Number(dayNumber(rule.startsOn))} {monthShort(rule.startsOn)}</span>
						</span>
					</div>
					<form method="POST" action="?/stop" use:enhance>
						<input type="hidden" name="id" value={rule.id} />
						<button class="btn-danger min-h-10 px-3 text-xs">Interrompi</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<div
			class="flex flex-col items-center gap-2 border border-field px-4 py-8 text-center text-dim"
		>
			<Repeat size={32} class="text-field" aria-hidden="true" />
			<p class="text-[15px]">Nessun todo ricorrente.</p>
		</div>
	{/if}
</div>
