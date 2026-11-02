<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import {
		MAX_PASSWORD_LENGTH,
		MIN_PASSWORD_LENGTH,
		STRENGTH_LABELS,
		passwordStrength
	} from '#lib/password-rules.ts';

	let {
		id,
		name = 'password',
		label = 'Password',
		autocomplete,
		value = $bindable(''),
		strength = false,
		error
	}: {
		id: string;
		name?: string;
		label?: string;
		autocomplete: 'current-password' | 'new-password';
		value?: string;
		/** indicatore di robustezza a 4 tacche (password nuove) */
		strength?: boolean;
		error?: string | null;
	} = $props();

	let visible = $state(false);
	const score = $derived(passwordStrength(value));
	const hintId = $derived(`${id}-hint`);
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="lbl text-soft">{label}</label>
	<div class="relative">
		<input
			{id}
			{name}
			{autocomplete}
			type={visible ? 'text' : 'password'}
			required
			minlength={autocomplete === 'new-password' ? MIN_PASSWORD_LENGTH : undefined}
			maxlength={MAX_PASSWORD_LENGTH}
			bind:value
			class="input pr-13"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={strength || error ? hintId : undefined}
		/>
		<button
			type="button"
			class="absolute top-0.5 right-0.5 flex size-11 items-center justify-center text-dim hover:text-volt"
			aria-label={visible ? 'Nascondi password' : 'Mostra password'}
			aria-pressed={visible}
			onclick={() => (visible = !visible)}
		>
			{#if visible}<EyeOff size={20} aria-hidden="true" />{:else}<Eye
					size={20}
					aria-hidden="true"
				/>{/if}
		</button>
	</div>
	{#if error}
		<span id={hintId} class="text-[13px] font-semibold text-alert" role="alert">{error}</span>
	{:else if strength}
		<div class="mt-0.5 flex gap-1" aria-hidden="true">
			{#each [1, 2, 3, 4] as step (step)}
				<span class="h-1 flex-1 {score >= step ? 'bg-volt' : 'bg-line'}"></span>
			{/each}
		</div>
		<span id={hintId} class="text-[13px] text-soft">
			{#if value}{STRENGTH_LABELS[score]}.{/if}
			Almeno {MIN_PASSWORD_LENGTH} caratteri; una frase è più sicura di una parola con simboli.
		</span>
	{/if}
</div>
