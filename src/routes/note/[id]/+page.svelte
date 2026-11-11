<script lang="ts">
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.note.title || 'Nota'} · NEURAL//NOTES</title></svelte:head>

<!-- un editor nuovo per ogni nota: passando da una all'altra non resta lo stato della precedente -->
{#key data.note.id}
	<NoteEditor
		note={data.note}
		today={data.today}
		reminder={data.reminder}
		attachments={data.attachments}
	/>
{/key}
