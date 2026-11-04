<script lang="ts">
	import { onMount } from 'svelte';

	// "Continua con Google": porta al consenso di Google con la pagina di ritorno e il fuso orario.
	let { next = null }: { next?: string | null } = $props();
	let timezone = $state('');
	onMount(() => (timezone = Intl.DateTimeFormat().resolvedOptions().timeZone));
</script>

<form method="GET" action="/auth/google" data-sveltekit-reload class="flex flex-col gap-3">
	<div class="flex items-center gap-3 text-dim" aria-hidden="true">
		<span class="h-px flex-1 bg-line"></span><span class="lbl">oppure</span><span
			class="h-px flex-1 bg-line"
		></span>
	</div>
	{#if next}<input type="hidden" name="next" value={next} />{/if}
	<input type="hidden" name="tz" value={timezone} />
	<button class="btn-outline h-13">
		<svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
			<path
				fill="currentColor"
				d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"
			/>
			<path
				fill="currentColor"
				d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
			/>
			<path
				fill="currentColor"
				d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
			/>
			<path
				fill="currentColor"
				d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z"
			/>
		</svg>
		Continua con Google
	</button>
</form>
