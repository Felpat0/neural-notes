<script lang="ts">
	import { onMount } from 'svelte';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import GoogleButton from '#lib/components/GoogleButton.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// fuso orario del dispositivo, per "oggi" e i promemoria
	let timezone = $state('');
	onMount(() => (timezone = Intl.DateTimeFormat().resolvedOptions().timeZone));
</script>

<svelte:head><title>Registrati · NEURAL//NOTES</title></svelte:head>

<AuthShell back={{ href: '/login', label: "Torna all'accesso" }}>
	{#if form?.checkInbox}
		<div role="status" class="flex flex-col gap-2 panel-top px-3.5 py-3 text-neon">
			<span class="lbl font-bold">■ Controlla la posta</span>
			<span class="text-[15px] leading-relaxed text-ink">
				Abbiamo mandato un'email a <strong>{form.email}</strong> con i passi successivi. Guarda anche
				nello spam.
			</span>
			<a href="/login" class="btn-link self-start lbl">Vai all'accesso</a>
		</div>
	{:else}
		<form method="POST" class="frame flex flex-col gap-3.5 px-4 pt-5 pb-4.5">
			<h1 class="ml-3 text-[26px] font-bold text-volt uppercase">Crea account</h1>
			<input type="hidden" name="timezone" value={timezone} />
			<div class="flex flex-col gap-1.5">
				<label for="su-name" class="lbl text-soft">Nome</label>
				<input
					id="su-name"
					name="name"
					autocomplete="name"
					required
					maxlength="60"
					value={form?.name ?? ''}
					class="input"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="su-email" class="lbl text-soft">Email</label>
				<input
					id="su-email"
					name="email"
					type="email"
					autocomplete="email"
					inputmode="email"
					required
					value={form?.email ?? ''}
					class="input"
				/>
			</div>
			<PasswordField id="su-pw" autocomplete="new-password" strength error={form?.passwordError} />
			{#if data.needsCode}
				<div class="flex flex-col gap-1.5">
					<label for="su-code" class="lbl text-soft">Codice d'invito</label>
					<input
						id="su-code"
						name="code"
						autocomplete="off"
						required
						class="input"
						aria-invalid={form?.codeError ? 'true' : undefined}
						aria-describedby={form?.codeError ? 'su-code-err' : undefined}
					/>
					{#if form?.codeError}
						<span id="su-code-err" class="text-[13px] font-semibold text-alert" role="alert">
							{form.codeError}
						</span>
					{/if}
				</div>
			{/if}
			{#if form?.error}<p class="text-sm font-semibold text-alert" role="alert">
					{form.error}
				</p>{/if}
			<button class="mt-1 btn-primary h-13">Registrati</button>
			<span class="text-[13px] text-dim">
				Ti mandiamo un'email per confermare l'indirizzo. Puoi usare l'app subito.
			</span>
		</form>
		<!-- con il codice d'invito la registrazione passa solo da questo modulo -->
		{#if data.googleEnabled && !data.needsCode}<GoogleButton />{/if}
		<p class="text-center text-[15px] text-soft">
			Hai già un account? <a href="/login" class="btn-link">Accedi</a>
		</p>
	{/if}
</AuthShell>
