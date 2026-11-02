<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { dayNumber, monthShort, weekdayName } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const WEEKDAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];
	const monthTitle = $derived.by(() => {
		const label = new Intl.DateTimeFormat('it', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${data.month}-15T12:00:00Z`));
		return label.charAt(0).toUpperCase() + label.slice(1);
	});
	const dayHref = (day: string) => (day === data.today ? '/' : `/?giorno=${day}`);
	const thisMonth = $derived(data.today.slice(0, 7));
</script>

<svelte:head><title>Calendario · NEURAL//NOTES</title></svelte:head>

<PageHeader title="Calendario" />

<div class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 md:px-6">
	<nav aria-label="Mese" class="flex items-center gap-2">
		<a href="?mese={data.prev}" class="btn size-11 min-h-0 p-0" aria-label="Mese precedente">
			<ChevronLeft size={20} aria-hidden="true" />
		</a>
		<h2 class="flex-1 text-center text-2xl font-bold text-volt uppercase" aria-live="polite">
			{monthTitle}
		</h2>
		<a href="?mese={data.next}" class="btn size-11 min-h-0 p-0" aria-label="Mese successivo">
			<ChevronRight size={20} aria-hidden="true" />
		</a>
	</nav>
	{#if data.month !== thisMonth}
		<a href="/calendario" class="btn-link self-center lbl text-[11px]">Torna a questo mese</a>
	{/if}

	<div class="grid grid-cols-7 gap-1" role="grid" aria-label={monthTitle}>
		{#each WEEKDAYS as weekday (weekday)}
			<span class="py-1 text-center lbl text-[10px] text-dim" role="columnheader">{weekday}</span>
		{/each}
		{#each data.days as day (day)}
			{@const inMonth = day.slice(0, 7) === data.month}
			{@const marker = data.markers[day]}
			{@const isToday = day === data.today}
			<a
				href={dayHref(day)}
				role="gridcell"
				aria-current={isToday ? 'date' : undefined}
				aria-label="{weekdayName(day)} {Number(dayNumber(day))} {monthShort(day)}{marker
					? `: ${marker.todos} da fare, ${marker.notes} note`
					: ''}"
				class="flex aspect-square min-h-12 flex-col justify-between border p-1.5 {isToday
					? 'border-volt bg-volt text-void'
					: inMonth
						? 'border-field hover:border-volt'
						: 'border-line text-dim'}"
			>
				<span class="text-lg leading-none font-bold">{Number(dayNumber(day))}</span>
				{#if marker}
					<span
						class="flex flex-wrap gap-x-1.5 text-[10px] leading-tight font-bold"
						aria-hidden="true"
					>
						{#if marker.todos}<span class={isToday ? '' : 'text-volt'}>☐{marker.todos}</span>{/if}
						{#if marker.notes}<span class={isToday ? '' : 'text-neon'}>✎{marker.notes}</span>{/if}
					</span>
				{/if}
			</a>
		{/each}
	</div>
	<p class="lbl text-[10px] text-dim">
		<span class="text-volt">☐</span> todo da fare · <span class="text-neon">✎</span> note assegnate
	</p>
</div>
