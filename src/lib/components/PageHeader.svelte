<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';

	// Intestazione gialla compatta delle pagine interne.
	let {
		title,
		back,
		actions
	}: { title: string; back?: { href: string; label: string }; actions?: Snippet } = $props();
</script>

<header class="flex items-center gap-1 bg-volt py-1.5 pr-3 pl-1 text-void md:pl-4">
	{#if back}
		<a href={back.href} aria-label={back.label} class="flex size-11 items-center justify-center">
			<ChevronLeft size={24} strokeWidth={2.5} aria-hidden="true" />
		</a>
	{:else}
		<span class="w-3 md:hidden"></span>
	{/if}
	<h1 class="flex-1 text-[26px] leading-none font-bold uppercase">{title}</h1>
	{@render actions?.()}
</header>
