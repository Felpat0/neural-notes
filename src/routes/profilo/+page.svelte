<script lang="ts">
	import { LogOut } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import { dateTime, describeAgent } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const user = $derived(data.user!);

	const timezones = Intl.supportedValuesOf('timeZone');
	let deleteOpen = $state(false);
</script>

<svelte:head><title>Profilo · NEURAL//NOTES</title></svelte:head>

<PageHeader title="Profilo" back={{ href: '/', label: 'Torna a Oggi' }} />

<div class="mx-auto flex max-w-xl flex-col gap-5 px-4 py-5 md:px-6">
	{#if !user.emailVerified}
		<div role="status" class="flex flex-col gap-2 panel-top px-3.5 py-3 text-neon">
			<span class="lbl font-bold">Email da confermare</span>
			<span class="text-[15px] leading-relaxed text-ink">
				Ti abbiamo mandato un link a <strong>{user.email}</strong>. Serve per collegare Google e
				cambiare email.
			</span>
			{#if form?.verifySent}
				<span class="text-sm font-semibold">Link inviato: controlla la posta.</span>
			{:else}
				<form method="POST" action="?/resendVerify">
					<button class="btn-link lbl">Rinvia il link</button>
				</form>
			{/if}
			{#if form?.verifyError}<span class="text-sm text-alert" role="alert">{form.verifyError}</span
				>{/if}
		</div>
	{/if}

	<form method="POST" action="?/account" class="frame flex flex-col gap-3.5 px-4 pt-5 pb-4.5">
		<h2 class="ml-3 text-xl font-bold text-volt uppercase">Account</h2>
		<div class="flex flex-col gap-1.5">
			<label for="pr-name" class="lbl text-soft">Nome</label>
			<input
				id="pr-name"
				name="name"
				autocomplete="name"
				required
				maxlength="60"
				value={user.name}
				class="input"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="lbl text-soft">Email</span>
			<span class="flex min-h-12 items-center gap-2 border border-line px-3 text-dim">
				{user.email}
				{#if user.emailVerified}<span class="ml-auto lbl text-neon">■ Confermata</span>{/if}
			</span>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="pr-tz" class="lbl text-soft">Fuso orario</label>
			<select id="pr-tz" name="timezone" class="input">
				{#each timezones as tz (tz)}
					<option value={tz} selected={tz === user.timezone}>{tz.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			<span class="text-[13px] text-dim">Decide cosa è "oggi" e l'ora dei promemoria.</span>
		</div>
		{#if form?.accountError}
			<p class="text-sm font-semibold text-alert" role="alert">{form.accountError}</p>
		{:else if form?.accountSaved}
			<p class="text-sm font-semibold text-neon" role="status">Salvato.</p>
		{/if}
		<button class="btn-primary">Salva</button>
	</form>

	<NotificationSettings />

	<form method="POST" action="?/password" class="frame flex flex-col gap-3.5 px-4 pt-5 pb-4.5">
		<h2 class="ml-3 text-xl font-bold text-volt uppercase">
			{user.hasPassword ? 'Cambia password' : 'Imposta una password'}
		</h2>
		<input type="hidden" name="username" autocomplete="username" value={user.email} />
		{#if user.hasPassword}
			<PasswordField
				id="pr-current"
				name="current"
				label="Password attuale"
				autocomplete="current-password"
				error={form?.currentError}
			/>
		{/if}
		<PasswordField
			id="pr-new"
			label="Nuova password"
			autocomplete="new-password"
			strength
			error={form?.passwordError}
		/>
		{#if form?.passwordSaved}
			<p class="text-sm font-semibold text-neon" role="status">
				Password aggiornata. Gli altri dispositivi dovranno rientrare.
			</p>
		{/if}
		<button class="btn-primary">Salva password</button>
	</form>

	<section class="frame flex flex-col gap-2 px-4 pt-5 pb-4.5" aria-labelledby="pr-sessions">
		<h2 id="pr-sessions" class="ml-3 text-xl font-bold text-volt uppercase">Dispositivi</h2>
		<ul class="flex flex-col">
			{#each data.sessions as session (session.key)}
				<li class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
					<div class="flex flex-1 flex-col">
						<span class="font-semibold">{describeAgent(session.userAgent)}</span>
						<span class="text-[13px] text-dim">
							Ultimo uso {dateTime(session.lastSeenAt, user.timezone)}
						</span>
					</div>
					{#if session.current}<span class="lbl text-neon">Questo</span>{/if}
				</li>
			{/each}
		</ul>
		{#if form?.othersClosed}
			<p class="text-sm font-semibold text-neon" role="status">Altri dispositivi disconnessi.</p>
		{:else if data.sessions.length > 1}
			<form method="POST" action="?/logoutOthers">
				<button class="btn-outline w-full">Esci da tutti gli altri</button>
			</form>
		{/if}
	</section>

	<form method="POST" action="?/logout">
		<button class="btn w-full"><LogOut size={18} aria-hidden="true" /> Esci</button>
	</form>

	<section class="flex flex-col gap-3 border border-alert px-4 py-4" aria-labelledby="pr-delete">
		<h2 id="pr-delete" class="lbl font-bold text-alert">Elimina account</h2>
		<p class="text-[14px] leading-relaxed text-soft">
			Elimina l'account con tutte le note, le liste e i promemoria. Non si può annullare.
		</p>
		{#if deleteOpen || form?.deleteError}
			<form method="POST" action="?/deleteAccount" class="flex flex-col gap-3">
				{#if user.hasPassword}
					<PasswordField id="pr-del-pw" label="Password" autocomplete="current-password" />
				{/if}
				<div class="flex flex-col gap-1.5">
					<label for="pr-del-confirm" class="lbl text-soft">Scrivi ELIMINA per confermare</label>
					<input id="pr-del-confirm" name="confirm" autocomplete="off" required class="input" />
				</div>
				{#if form?.deleteError}
					<p class="text-sm font-semibold text-alert" role="alert">{form.deleteError}</p>
				{/if}
				<button class="btn-danger">Elimina definitivamente</button>
			</form>
		{:else}
			<button class="btn-danger self-start" onclick={() => (deleteOpen = true)}>
				Elimina account…
			</button>
		{/if}
	</section>
</div>
