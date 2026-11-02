<script lang="ts">
	import { page } from '$app/state';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// l'azione conserva ?next= per tornare alla pagina chiesta
	const next = $derived(page.url.searchParams.get('next'));
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
		<button class="btn-primary h-13">Accedi</button>
	</form>

	{#if data.signupOpen}
		<p class="text-center text-[15px] text-soft">
			Non hai un account? <a href="/registrati" class="btn-link">Registrati</a>
		</p>
	{/if}
</AuthShell>
