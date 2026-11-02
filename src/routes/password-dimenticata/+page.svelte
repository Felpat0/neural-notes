<script lang="ts">
	import { onDestroy } from 'svelte';
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// "Rinvia" dopo 60 secondi
	const WAIT = 60;
	let wait = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;
	function startWait() {
		wait = WAIT;
		clearInterval(timer);
		timer = setInterval(() => {
			wait -= 1;
			if (wait <= 0) clearInterval(timer);
		}, 1000);
	}
	onDestroy(() => clearInterval(timer));

	const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<svelte:head><title>Password dimenticata · NEURAL//NOTES</title></svelte:head>

<AuthShell back={{ href: '/login', label: "Torna all'accesso" }}>
	<form
		method="POST"
		class="frame flex flex-col gap-3.5 px-4 pt-5 pb-4.5"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') startWait();
			}}
	>
		<h1 class="ml-3 text-[26px] leading-none font-bold text-volt uppercase">
			Password<br />dimenticata
		</h1>
		<p class="text-[15px] leading-relaxed text-soft">
			Scrivi l'email dell'account: ti mandiamo un link per sceglierne una nuova. Il link vale un'ora
			e si usa una volta sola.
		</p>
		<div class="flex flex-col gap-1.5">
			<label for="fp-email" class="lbl text-soft">Email</label>
			<input
				id="fp-email"
				name="email"
				type="email"
				autocomplete="email"
				inputmode="email"
				required
				value={form?.email ?? data.email}
				class="input"
			/>
		</div>
		{#if form?.error}<p class="text-sm font-semibold text-alert" role="alert">{form.error}</p>{/if}
		<button class="btn-primary h-13" disabled={wait > 0}>
			{form?.sent ? (wait > 0 ? `Rinvia tra ${clock(wait)}` : 'Rinvia il link') : 'Invia il link'}
		</button>
	</form>

	{#if form?.sent}
		<div role="status" class="flex flex-col gap-1.5 panel-top px-3.5 py-3 text-neon">
			<span class="lbl font-bold">■ Controlla la posta</span>
			<span class="text-[15px] leading-relaxed text-ink">
				Se esiste un account con questo indirizzo, l'email arriva entro qualche minuto. Guarda anche
				nello spam.
			</span>
		</div>
	{/if}

	<p class="text-center text-[15px] text-soft">
		Ti sei ricordato? <a href="/login" class="btn-link">Accedi</a>
	</p>
</AuthShell>
