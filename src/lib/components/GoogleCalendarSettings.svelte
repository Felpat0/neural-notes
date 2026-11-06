<script lang="ts">
	import { CalendarSync, RefreshCw, Unlink } from '@lucide/svelte';
	import { dateTime } from '#lib/format.ts';

	// Profilo → Google Calendar: collegamento, cosa inviare, calendari i cui eventi diventano todo, scollega.
	type Props = {
		google: {
			calendarEnabled: boolean;
			account: {
				email: string;
				pushTodos: boolean;
				pushUntimedTodos: boolean;
				pushNotes: boolean;
				pullChanges: boolean;
				readCalendarIds: string[];
				syncedAt: Date | null;
				lastError: string | null;
			} | null;
			calendars: { id: string; name: string; color: string | null; primary: boolean }[] | null;
		};
		form: Record<string, unknown> | null | undefined;
		/** Esito del ritorno da Google (?google=…). */
		result: string | null;
		timezone: string;
	};
	let { google, form, result, timezone }: Props = $props();

	const RESULTS: Record<string, { ok: boolean; text: string }> = {
		collegato: {
			ok: true,
			text: 'Collegato: todo e note arrivano nel calendario NEURAL//NOTES entro qualche secondo.'
		},
		annullato: { ok: false, text: 'Collegamento annullato.' },
		scaduto: { ok: false, text: 'Richiesta scaduta: riprova.' },
		'in-uso': {
			ok: false,
			text: 'Questo account Google è già collegato a un altro account NEURAL//NOTES.'
		},
		errore: { ok: false, text: 'Collegamento non riuscito: riprova tra poco.' }
	};
	const message = $derived(result ? RESULTS[result] : null);
	const acct = $derived(google.account);
	let disconnectOpen = $state(false);

	const checkbox =
		'size-5.5 shrink-0 rounded-none border-2 border-volt bg-void text-volt focus:ring-neon';
</script>

{#if google.calendarEnabled}
	<section class="frame flex flex-col gap-3.5 px-4 pt-5 pb-4.5" aria-labelledby="gc-title">
		<h2 id="gc-title" class="ml-3 text-xl font-bold text-volt uppercase">Google Calendar</h2>

		{#if message && !form?.googleDisconnected}
			<p
				class="text-sm font-semibold {message.ok ? 'text-neon' : 'text-alert'}"
				role={message.ok ? 'status' : 'alert'}
			>
				{message.text}
			</p>
		{/if}

		{#if !acct}
			{#if form?.googleDisconnected}
				<p class="text-sm font-semibold text-neon" role="status">Google Calendar scollegato.</p>
			{/if}
			<p class="text-[15px] leading-relaxed text-soft">
				I todo con orario e le note con un giorno finiscono in un calendario "NEURAL//NOTES" creato
				dall'app; gli eventi dei tuoi calendari diventano todo con orario. Le modifiche fatte in
				Google tornano nell'app.
			</p>
			<a href="/api/google/connect" class="btn-primary" data-sveltekit-reload>
				<CalendarSync size={18} aria-hidden="true" /> Collega Google Calendar
			</a>
		{:else}
			<div class="flex flex-col gap-0.5">
				<span class="font-semibold">{acct.email}</span>
				<span class="text-[13px] text-dim">
					{acct.syncedAt
						? `Ultima sincronizzazione ${dateTime(acct.syncedAt, timezone)}`
						: 'Prima sincronizzazione in corso…'}
				</span>
			</div>
			{#if acct.lastError}
				<p class="text-sm font-semibold text-alert" role="alert">{acct.lastError}</p>
			{/if}

			<form method="POST" action="?/googleSettings" class="flex flex-col gap-3.5">
				<fieldset class="flex flex-col gap-1">
					<legend class="mb-1 lbl text-soft">Nel calendario NEURAL//NOTES</legend>
					<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
						<input type="checkbox" name="pushTodos" checked={acct.pushTodos} class={checkbox} />
						Todo con orario (anche i ricorrenti)
					</label>
					<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
						<input
							type="checkbox"
							name="pushUntimedTodos"
							checked={acct.pushUntimedTodos}
							class={checkbox}
						/>
						Anche i todo senza orario (tutto il giorno)
					</label>
					<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
						<input type="checkbox" name="pushNotes" checked={acct.pushNotes} class={checkbox} />
						Note con un giorno o un promemoria
					</label>
					<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
						<input type="checkbox" name="pullChanges" checked={acct.pullChanges} class={checkbox} />
						Riporta nell'app le modifiche fatte in Google
					</label>
				</fieldset>

				<fieldset class="flex flex-col gap-1">
					<legend class="mb-1 lbl text-soft">Eventi che diventano todo</legend>
					{#if google.calendars === null}
						<p class="text-sm text-alert">
							Elenco dei calendari non disponibile: riprova più tardi.
						</p>
						{#each acct.readCalendarIds as id (id)}
							<input type="hidden" name="calendar" value={id} />
						{/each}
					{:else if !google.calendars.length}
						<p class="text-sm text-dim">Nessun calendario nell'account.</p>
					{:else}
						{#each google.calendars as calendar (calendar.id)}
							<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
								<input
									type="checkbox"
									name="calendar"
									value={calendar.id}
									checked={acct.readCalendarIds.includes(calendar.id)}
									class={checkbox}
								/>
								<span
									class="size-3 shrink-0"
									style:background={calendar.color ?? 'var(--color-soft)'}
									aria-hidden="true"
								></span>
								<span class="min-w-0 truncate">{calendar.name}</span>
								{#if calendar.primary}<span class="lbl text-dim">Principale</span>{/if}
							</label>
						{/each}
					{/if}
				</fieldset>

				{#if form?.googleError}
					<p class="text-sm font-semibold text-alert" role="alert">{form.googleError}</p>
				{:else if form?.googleSaved}
					<p class="text-sm font-semibold text-neon" role="status">Salvato.</p>
				{:else if form?.googleSynced}
					<p class="text-sm font-semibold text-neon" role="status">Sincronizzato.</p>
				{/if}
				<button class="btn-primary">Salva</button>
			</form>

			<form method="POST" action="?/googleSync">
				<button class="btn-outline w-full">
					<RefreshCw size={18} aria-hidden="true" /> Sincronizza ora
				</button>
			</form>

			{#if disconnectOpen}
				<form
					method="POST"
					action="?/googleDisconnect"
					class="flex flex-col gap-3 border border-alert px-3.5 py-3"
				>
					<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
						<input type="checkbox" name="deleteCalendar" class={checkbox} />
						Elimina anche il calendario NEURAL//NOTES da Google
					</label>
					<div class="flex gap-2">
						<button type="button" class="btn flex-1" onclick={() => (disconnectOpen = false)}>
							Annulla
						</button>
						<button class="btn-danger flex-1">Scollega</button>
					</div>
				</form>
			{:else}
				<button
					type="button"
					class="btn-link self-start lbl"
					onclick={() => (disconnectOpen = true)}
				>
					<Unlink size={14} aria-hidden="true" class="inline" /> Scollega Google Calendar
				</button>
			{/if}
		{/if}
	</section>
{/if}
