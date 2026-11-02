<script lang="ts">
	import AuthShell from '#lib/components/AuthShell.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Conferma email · NEURAL//NOTES</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<AuthShell>
	<div class="frame flex flex-col gap-3 px-4 pt-5 pb-4.5">
		{#if data.ok}
			<h1 class="ml-3 text-[26px] font-bold text-volt uppercase">Email confermata</h1>
			<p class="text-[15px] leading-relaxed text-soft">
				<strong class="text-white">{data.email}</strong> è confermato.
			</p>
		{:else}
			<h1 class="ml-3 text-[26px] font-bold text-volt uppercase">Link non valido</h1>
			<p class="text-[15px] leading-relaxed text-soft">
				Il link è scaduto o è già stato usato. Puoi chiederne uno nuovo dal Profilo.
			</p>
		{/if}
		<a href={data.loggedIn ? (data.ok ? '/' : '/profilo') : '/login'} class="btn-primary h-13">
			{data.loggedIn ? (data.ok ? "Vai all'app" : 'Vai al profilo') : 'Accedi'}
		</a>
	</div>
</AuthShell>
