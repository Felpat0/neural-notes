<script lang="ts">
	import { ChevronLeft, ChevronRight, FilePlus, Settings } from '@lucide/svelte';
	import NoteCard from '#lib/components/NoteCard.svelte';
	import NoteGroups from '#lib/components/NoteGroups.svelte';
	import OverdueList from '#lib/components/OverdueList.svelte';
	import TodoList from '#lib/components/TodoList.svelte';
	import DraftNotes from '#lib/components/DraftNotes.svelte';
	import VoiceRecorder from '#lib/components/VoiceRecorder.svelte';
	import { addDays, dayNumber, monthShort, weekdayName, weekdayShort } from '#lib/format.ts';
	import { onMount } from 'svelte';
	import { newNote } from '#lib/new-note.ts';
	import { warmPages } from '#lib/offline-pages.ts';
	import { outbox } from '#lib/outbox.svelte.ts';
	import { editQuery } from '#lib/url.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// note eliminate offline (eliminazione ancora in coda): non si mostrano
	const cards = $derived(data.cards.filter((c) => !outbox.isDeleted(c.id)));

	// le note del giorno e le più recenti si salvano sul dispositivo: si aprono anche offline
	onMount(() => {
		const recent = data.groups.flatMap((g) => g.notes).slice(0, 10);
		warmPages([...data.cards, ...recent].map((n) => `/note/${n.id}`));
	});

	const dayHref = (day: string) => (day === data.today ? '/' : `/?giorno=${day}`);
	const moreQuery = $derived(
		editQuery('', {
			giorno: data.day === data.today ? null : data.day,
			mesi: data.months + 3
		}).slice(1)
	);
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
					aria-label={`${weekdayName(day)} ${Number(dayNumber(day))} ${monthShort(day)}${
						data.markers[day]
							? `: ${data.markers[day].todos} da fare, ${data.markers[day].notes} note`
							: ''
					}`}
					class="relative flex flex-col items-center border border-void py-1 {selected
						? 'bg-void text-volt'
						: ''} {day === data.today && !selected ? 'border-2' : ''}"
				>
					<span class="lbl text-[9px] tracking-[1px]">{weekdayShort(day)}</span>
					<span class="text-base leading-tight font-bold">{dayNumber(day)}</span>
					{#if data.markers[day]}
						<span class="absolute top-0.5 right-0.5 size-1.5 bg-alert" aria-hidden="true"></span>
					{/if}
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

<!-- da 1024 px due colonne: lista e todo in sospeso a sinistra, note a destra -->
<div
	class="mx-auto grid max-w-3xl grid-cols-1 items-start gap-5 px-4 pt-5 pb-28 md:px-6 md:pb-10 lg:max-w-6xl lg:grid-cols-2 lg:gap-8"
>
	<div class="flex min-w-0 flex-col gap-5">
		{#if data.welcome}
			<div role="status" class="flex flex-col gap-1 panel-top px-3.5 py-3 text-neon">
				<span class="lbl font-bold">Benvenuto</span>
				<span class="text-[15px] text-ink">
					Account creato. Ti abbiamo mandato un'email per confermare l'indirizzo.
				</span>
			</div>
		{/if}

		<section aria-label="Lista del giorno" class="frame flex flex-col px-3.5 pt-4 pb-2">
			<!-- una lista nuova per ogni giorno, e dopo "Porta a oggi" (dati ricaricati) -->
			{#key data.dayList}
				<TodoList
					title={data.day === data.today ? 'Lista di oggi' : 'Lista del giorno'}
					items={data.dayList.items}
					checklistId={data.dayList.checklistId}
					day={data.day}
					today={data.today}
					shortcuts
				/>
			{/key}
			<a href="/ricorrenti" class="btn-link self-end lbl text-[10px]">Ricorrenti ›</a>
		</section>

		{#key data.overdue}
			<OverdueList items={data.overdue} today={data.today} />
		{/key}
	</div>

	<div class="flex min-w-0 flex-col gap-5">
		<section aria-labelledby="day-notes" class="flex flex-col gap-3">
			<div class="flex items-center gap-2.5">
				<span aria-hidden="true" class="h-0.5 w-3 bg-neon"></span>
				<h2 id="day-notes" class="flex-1 lbl text-[13px] font-bold text-neon">
					{data.day === data.today ? 'Note di oggi' : 'Note del giorno'}
				</h2>
				<form method="POST" action="/note?/create" data-offline onsubmit={newNote(data.day)}>
					<input type="hidden" name="day" value={data.day} />
					<button class="btn-link lbl text-[11px]">+ Nota per questo giorno</button>
				</form>
			</div>
			{#each cards as note (note.id)}
				<NoteCard {note} today={data.today} />
			{:else}
				<p class="border border-line px-3.5 py-3 text-sm text-dim">
					Nessuna nota assegnata a questo giorno.
				</p>
			{/each}
		</section>

		<section aria-labelledby="notes-title" class="flex flex-col gap-3">
			<div class="flex items-baseline justify-between">
				<h2 id="notes-title" class="text-[34px] leading-none font-bold text-volt uppercase">
					Note
				</h2>
				<a href="/cerca" class="btn-link lbl text-[11px]">Cerca ›</a>
			</div>
			<DraftNotes />
			{#if data.groups.length}
				<NoteGroups
					groups={data.groups}
					timezone={data.user!.timezone}
					olderHref={data.older ? `/?${moreQuery}` : null}
				/>
			{:else}
				<p class="border border-line px-3.5 py-3 text-sm text-dim">Ancora nessuna nota.</p>
			{/if}
		</section>
	</div>
</div>

<form
	method="POST"
	action="/note?/create"
	data-offline
	onsubmit={newNote()}
	class="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 md:right-6 md:bottom-6"
>
	<button class="btn-primary size-15 p-0" aria-label="Nuova nota">
		<FilePlus size={26} strokeWidth={2.5} aria-hidden="true" />
	</button>
</form>

<!-- nota vocale al volo, sopra "Nuova nota": finisce tra le note di oggi -->
{#if data.voice?.enabled}
	<VoiceRecorder consent={data.voice.consent} day={data.today} />
{/if}
