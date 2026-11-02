<script lang="ts">
	import { ChevronLeft, ChevronRight, Settings } from '@lucide/svelte';
	import { addDays, dayNumber, monthShort, weekdayName, weekdayShort } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dayHref = (day: string) => (day === data.today ? '/' : `/?giorno=${day}`);
</script>

<svelte:head><title>Oggi · NEURAL//NOTES</title></svelte:head>

<header class="flex flex-col gap-1.5 bg-volt pt-1.5 pr-3 pl-4 text-void">
	<div class="flex items-center gap-1">
		<h1 class="flex-1 text-[30px] leading-none font-bold tracking-tight uppercase">
			{dayNumber(data.day)}
			{monthShort(data.day)}
			<span class="text-[13px] font-semibold tracking-[2px]">· {weekdayName(data.day)}</span>
		</h1>
		<a
			href="/profilo"
			aria-label="Profilo e impostazioni"
			class="flex size-11 items-center justify-center md:hidden"
		>
			<Settings size={20} strokeWidth={2.2} aria-hidden="true" />
		</a>
	</div>
	<nav aria-label="Settimana" class="mr-1 flex items-stretch gap-1">
		<a
			href={dayHref(addDays(data.week[0], -7))}
			aria-label="Settimana precedente"
			class="flex w-8 items-center justify-center"
		>
			<ChevronLeft size={18} strokeWidth={2.5} aria-hidden="true" />
		</a>
		<div class="grid flex-1 grid-cols-7 gap-1">
			{#each data.week as day (day)}
				{@const selected = day === data.day}
				<a
					href={dayHref(day)}
					aria-current={day === data.today ? 'date' : undefined}
					aria-label={`${weekdayName(day)} ${Number(dayNumber(day))} ${monthShort(day)}`}
					class="relative flex flex-col items-center border border-void py-1 {selected
						? 'bg-void text-volt'
						: ''} {day === data.today && !selected ? 'border-2' : ''}"
				>
					<span class="lbl text-[9px] tracking-[1px]">{weekdayShort(day)}</span>
					<span class="text-base leading-tight font-bold">{dayNumber(day)}</span>
				</a>
			{/each}
		</div>
		<a
			href={dayHref(addDays(data.week[0], 7))}
			aria-label="Settimana successiva"
			class="flex w-8 items-center justify-center"
		>
			<ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" />
		</a>
	</nav>
	<div class="mt-0.5 -mr-3 -ml-4 notch" aria-hidden="true"></div>
</header>

<div class="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-5 pb-8 md:px-6">
	{#if data.welcome}
		<div role="status" class="flex flex-col gap-1 panel-top px-3.5 py-3 text-neon">
			<span class="lbl font-bold">Benvenuto</span>
			<span class="text-[15px] text-ink">
				Account creato. Ti abbiamo mandato un'email per confermare l'indirizzo.
			</span>
		</div>
	{/if}

	<section aria-labelledby="day-list" class="frame flex flex-col gap-2 px-3.5 pt-4 pb-4">
		<h2 id="day-list" class="ml-2.5 text-xl font-bold text-volt uppercase">Lista del giorno</h2>
		<p class="text-[15px] text-dim">I todo del giorno arrivano con la fase 3.</p>
	</section>

	<section aria-labelledby="notes-title" class="flex flex-col gap-3">
		<h2 id="notes-title" class="text-[34px] leading-none font-bold text-volt uppercase">Note</h2>
		<h3 class="sep">Oggi <span class="text-[11px]">0</span></h3>
		<p class="text-[15px] text-dim">Le note arrivano con la fase 2.</p>
	</section>
</div>
