<script lang="ts">
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import { todayIn } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Nuova nota · NEURAL//NOTES</title></svelte:head>

{#key data.id}
	<NoteEditor
		note={{
			id: data.id,
			title: '',
			content: null,
			day: data.day,
			tags: [],
			pinned: false,
			updatedAt: null
		}}
		today={todayIn(data.timezone)}
		reminder={null}
	/>
{/key}
