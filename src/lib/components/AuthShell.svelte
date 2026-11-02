<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';

	// Intestazione gialla delle pagine dell'account: grande (accesso) o compatta con "indietro".
	let {
		back,
		hero = false,
		children
	}: { back?: { href: string; label: string }; hero?: boolean; children: Snippet } = $props();
</script>

<div class="flex min-h-dvh flex-col">
	{#if hero}
		<header class="flex flex-col gap-1 bg-volt px-6 pt-12 text-void">
			<span class="lbl font-bold">Note · Todo · Promemoria</span>
			<span class="text-[44px] leading-[0.9] font-bold tracking-tight">NEURAL<br />//NOTES</span>
			<div class="-mx-6 mt-6 notch" aria-hidden="true"></div>
		</header>
	{:else}
		<header class="flex items-center gap-1 bg-volt py-1.5 pr-4 pl-1 text-void">
			{#if back}
				<a
					href={back.href}
					aria-label={back.label}
					class="flex size-11 items-center justify-center"
				>
					<ChevronLeft size={24} strokeWidth={2.5} aria-hidden="true" />
				</a>
			{:else}
				<span class="w-3"></span>
			{/if}
			<span class="text-sm font-bold tracking-[3px]">NEURAL//NOTES</span>
		</header>
	{/if}
	<main class="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-7">
		{@render children()}
	</main>
</div>
