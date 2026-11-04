<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { forgetPages } from '#lib/offline-pages.ts';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import GoogleButton from '#lib/components/GoogleButton.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// l'azione conserva ?next= per tornare alla pagina chiesta
	const next = $derived(page.url.searchParams.get('next'));

	// ritorno da "Continua con Google" non riuscito
	const GOOGLE_ERRORS: Record<string, string> = {
		annullato: 'Accesso con Google annullato.',
		scaduto: 'Richiesta scaduta: riprova.',
		errore: 'Accesso con Google non riuscito: riprova.',
		'non-confermata':
			'Esiste già un account con questa email, non ancora confermata: accedi con la password e conferma l’indirizzo.',
		'in-uso': 'Questa email è già collegata a un altro account Google.',
		chiusa: 'Le registrazioni sono chiuse: serve un account già esistente.',
		codice: 'Per registrarti serve il codice d’invito: usa la pagina Registrati.'
	};
	const googleError = $derived(GOOGLE_ERRORS[page.url.searchParams.get('google') ?? '']);

	// fuori dall'account (uscita o sessione scaduta): via le pagine salvate per l'uso offline;
	// le modifiche in coda restano e partono al prossimo accesso dello stesso utente
	onMount(forgetPages);
</script>

<svelte:head><title>Accedi · NEURAL//NOTES</title></svelte:head>

<AuthShell hero>
	<form
		method="POST"
		action={next ? `?next=${encodeURIComponent(next)}` : undefined}
		class="frame flex flex-col gap-3.5 px-4 pt-5 pb-4.5"
	>
		<h1 class="ml-3 text-[26px] font-bold text-volt uppercase">Accedi</h1>
		<div class="flex flex-col gap-1.5">
			<label for="li-email" class="lbl text-soft">Email</label>
			<input
				id="li-email"
				name="email"
				type="email"
				autocomplete="username"
				inputmode="email"
				required
				value={form?.email ?? ''}
				class="input"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<PasswordField id="li-pw" autocomplete="current-password" />
			<a href="/password-dimenticata" class="btn-link self-end lbl">Password dimenticata?</a>
		</div>
		<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
			<input
				type="checkbox"
				name="remember"
				checked
				class="size-5.5 rounded-none border-2 border-volt bg-void text-volt focus:ring-neon"
			/>
			Resta collegato su questo dispositivo
		</label>
		{#if form?.error}<p class="text-sm font-semibold text-alert" role="alert">{form.error}</p>{/if}
		{#if googleError && !form}
			<p class="text-sm font-semibold text-alert" role="alert">{googleError}</p>
		{/if}
		<button class="btn-primary h-13">Accedi</button>
	</form>
	{#if data.googleEnabled}<GoogleButton {next} />{/if}

	{#if data.signupOpen}
		<p class="text-center text-[15px] text-soft">
			Non hai un account? <a href="/registrati" class="btn-link">Registrati</a>
		</p>
	{/if}
</AuthShell>
