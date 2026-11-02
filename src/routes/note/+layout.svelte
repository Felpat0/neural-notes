<script lang="ts">
	import { page } from '$app/state';
	import NoteList from '#lib/components/NoteList.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// telefono: elenco o nota, una alla volta; da 600 px elenco e nota affiancati
	// (a schermo intero, ?full=1, solo la nota)
	const open = $derived(!!page.params.id);
	const full = $derived(open && page.url.searchParams.has('full'));
</script>

<!-- da 600 px i due pannelli scorrono ognuno per conto suo -->
<div class="flex min-h-dvh md:h-dvh">
	<aside
		class="w-full shrink-0 border-line px-4 py-4 md:w-80 md:overflow-y-auto md:border-r lg:w-96 {open
			? 'max-md:hidden'
			: ''} {full ? 'md:hidden' : ''}"
		aria-label="Elenco delle note"
	>
		<NoteList
			groups={data.groups}
			tags={data.tags}
			q={data.q}
			tag={data.tag}
			months={data.months}
			older={data.older}
			timezone={data.user!.timezone}
			activeId={page.params.id}
		/>
	</aside>
	<div class="min-w-0 flex-1 md:overflow-y-auto {open ? '' : 'max-md:hidden'}">
		{@render children()}
	</div>
</div>
