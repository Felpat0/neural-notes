<script lang="ts">
	import '@fontsource/chakra-petch/400.css';
	import '@fontsource/chakra-petch/500.css';
	import '@fontsource/chakra-petch/600.css';
	import '@fontsource/chakra-petch/700.css';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { CalendarDays, FileText, House, Search, Settings } from '@lucide/svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const NAV = [
		{ href: '/', label: 'Oggi', icon: House, match: (p: string) => p === '/' },
		{ href: '/note', label: 'Note', icon: FileText, match: (p: string) => p.startsWith('/note') },
		{
			href: '/calendario',
			label: 'Calendario',
			icon: CalendarDays,
			match: (p: string) => p.startsWith('/calendario')
		},
		{ href: '/cerca', label: 'Cerca', icon: Search, match: (p: string) => p.startsWith('/cerca') }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#000000" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black" />
	<meta name="apple-mobile-web-app-title" content="NEURAL//NOTES" />
</svelte:head>

{#if data.user}
	<nav class="app-nav" aria-label="Navigazione principale">
		<span class="app-nav-brand" aria-hidden="true">N//</span>
		{#each NAV as item (item.href)}
			{@const active = item.match(page.url.pathname)}
			<a href={item.href} aria-current={active ? 'page' : undefined}>
				<item.icon size={22} strokeWidth={2} aria-hidden="true" />
				<span class="lbl" style="font-size: 10px">{item.label}</span>
			</a>
		{/each}
		<span class="app-nav-spacer"></span>
		<a
			href="/profilo"
			class="max-md:hidden!"
			aria-label="Profilo e impostazioni"
			aria-current={page.url.pathname.startsWith('/profilo') ? 'page' : undefined}
		>
			<Settings size={22} aria-hidden="true" />
		</a>
	</nav>
	<main class="app-main">
		{@render children()}
	</main>
{:else}
	{@render children()}
{/if}
