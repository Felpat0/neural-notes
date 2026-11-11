<script module lang="ts">
	export type Attachment = {
		id: string;
		durationMs: number | null;
		transcript: 'pending' | 'done' | 'error' | null;
		transcriptError: string | null;
	};
</script>

<script lang="ts">
	// Audio delle note vocali, sopra il testo della nota: ascolto, stato della trascrizione,
	// "Trascrivi di nuovo" se non è riuscita, eliminazione dell'audio (il testo resta).
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { LoaderCircle, Mic, Play, RotateCcw, Trash2 } from '@lucide/svelte';
	import { outbox } from '#lib/outbox.svelte.ts';

	let { attachments }: { attachments: Attachment[] } = $props();

	/** audio scaricato (il file si legge con fetch: così va anche su Safari, senza richieste Range) */
	let urls = $state<Record<string, string>>({});
	let loading = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);

	const clock = (ms: number | null) => {
		if (!ms) return '';
		const s = Math.round(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};

	async function load(id: string) {
		loading = id;
		try {
			const res = await fetch(`/api/attachments/${id}`);
			if (!res.ok) throw new Error();
			urls[id] = URL.createObjectURL(await res.blob());
		} catch {
			outbox.notify('Audio non disponibile: serve la connessione.');
		} finally {
			loading = null;
		}
	}

	async function retry(id: string) {
		busy = id;
		try {
			const res = await fetch(`/api/attachments/${id}/transcribe`, { method: 'POST' });
			const data = (await res.json().catch(() => null)) as {
				transcribed?: boolean;
				message?: string | null;
			} | null;
			if (!res.ok || !data?.transcribed)
				outbox.notify(`Trascrizione non riuscita: ${data?.message ?? 'riprova più tardi'}`);
			await invalidateAll();
		} catch {
			outbox.notify('Trascrizione non riuscita: serve la connessione.');
		} finally {
			busy = null;
		}
	}

	async function remove(id: string) {
		if (confirmDelete !== id) {
			confirmDelete = id;
			setTimeout(() => confirmDelete === id && (confirmDelete = null), 4000);
			return;
		}
		confirmDelete = null;
		busy = id;
		try {
			const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
			if (!res.ok && res.status !== 404) throw new Error();
			await invalidateAll();
		} catch {
			outbox.notify('Audio non eliminato: serve la connessione.');
		} finally {
			busy = null;
		}
	}

	onDestroy(() => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)));
</script>

{#if attachments.length}
	<ul class="flex flex-col gap-2" aria-label="Note vocali">
		{#each attachments as a (a.id)}
			<li class="flex flex-col gap-1.5 border border-line px-2 py-1.5">
				<div class="flex items-center gap-2">
					<Mic size={16} class="ml-1 shrink-0 text-alert" aria-hidden="true" />
					{#if urls[a.id]}
						<audio src={urls[a.id]} controls autoplay class="h-10 min-w-0 flex-1"></audio>
					{:else}
						<button
							class="flex min-h-11 flex-1 items-center gap-2 text-left font-semibold text-ink"
							disabled={loading === a.id}
							onclick={() => load(a.id)}
						>
							{#if loading === a.id}
								<LoaderCircle size={18} class="animate-spin" aria-hidden="true" />
							{:else}
								<Play size={18} aria-hidden="true" />
							{/if}
							<span class="lbl">Ascolta</span>
							<span class="text-sm text-dim tabular-nums">{clock(a.durationMs)}</span>
						</button>
					{/if}
					<button
						class="flex min-h-11 shrink-0 items-center gap-1 px-2 {confirmDelete === a.id
							? 'text-alert'
							: 'text-dim'}"
						aria-label={confirmDelete === a.id ? 'Conferma: elimina l’audio' : 'Elimina l’audio'}
						disabled={busy === a.id}
						onclick={() => remove(a.id)}
					>
						<Trash2 size={18} aria-hidden="true" />
						{#if confirmDelete === a.id}<span class="lbl text-[10px]">Elimina?</span>{/if}
					</button>
				</div>
				{#if a.transcript === 'pending'}
					<p class="pl-1 lbl text-[10px] text-dim">Trascrizione in corso…</p>
				{:else if a.transcript === 'error'}
					<div class="flex flex-wrap items-center gap-x-3 pl-1">
						<p class="flex-1 text-sm text-alert">
							Trascrizione non riuscita{a.transcriptError ? `: ${a.transcriptError}` : ''}
						</p>
						<button
							class="btn-link gap-1.5 lbl text-[11px]"
							disabled={busy === a.id}
							onclick={() => retry(a.id)}
						>
							<RotateCcw size={14} class={busy === a.id ? 'animate-spin' : ''} aria-hidden="true" />
							Trascrivi di nuovo
						</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
