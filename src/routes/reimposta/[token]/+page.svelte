<script lang="ts">
	import AuthShell from '#lib/components/AuthShell.svelte';
	import PasswordField from '#lib/components/PasswordField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Nuova password · NEURAL//NOTES</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<AuthShell>
	{#if !data.email || form?.expired}
		<div class="frame flex flex-col gap-3 px-4 pt-5 pb-4.5">
			<h1 class="ml-3 text-[26px] font-bold text-volt uppercase">Link non valido</h1>
			<p class="text-[15px] leading-relaxed text-soft">
				Il link è scaduto o è già stato usato. Ogni link vale un'ora e si usa una volta sola.
			</p>
			<a href="/password-dimenticata" class="btn-primary h-13">Chiedine uno nuovo</a>
		</div>
	{:else}
		<form method="POST" class="frame flex flex-col gap-3.5 px-4 pt-5 pb-4.5">
			<h1 class="ml-3 text-[26px] font-bold text-volt uppercase">Nuova password</h1>
			<p class="text-[15px] text-soft">Account: <strong class="text-white">{data.email}</strong></p>
			<!-- per i gestori di password -->
			<input type="hidden" name="username" autocomplete="username" value={data.email} />
			<PasswordField
				id="rp-pw"
				label="Nuova password"
				autocomplete="new-password"
				strength
				error={form?.passwordError}
			/>
			<PasswordField
				id="rp-pw2"
				name="confirm"
				label="Ripeti password"
				autocomplete="new-password"
				error={form?.confirmError}
			/>
			<label class="flex min-h-11 items-center gap-2.5 text-[15px]">
				<input
					type="checkbox"
					name="logoutOthers"
					checked
					class="size-5.5 rounded-none border-2 border-volt bg-void text-volt focus:ring-neon"
				/>
				Esci da tutti gli altri dispositivi
			</label>
			<button class="btn-primary h-13">Salva e accedi</button>
		</form>
	{/if}
</AuthShell>
