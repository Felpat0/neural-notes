<script lang="ts">
	// Pulsante flottante delle note vocali (home). Un tocco avvia la registrazione e un altro la
	// ferma e la salva; tenendolo premuto registra finché non si alza il dito. L'audio va nella
	// coda offline (nota nuova + allegato) e il server lo trascrive con Gemini appena arriva.
	// La prima volta chiede il consenso: l'audio viene inviato a Google.
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Mic, Square, X } from '@lucide/svelte';
	import { newId, outbox } from '#lib/outbox.svelte.ts';

	let { consent, day }: { consent: boolean; day: string } = $props();

	/** oltre questo tempo di pressione è "tieni premuto per parlare" */
	const HOLD_MS = 450;
	/** sotto questa durata è un tocco sbagliato, non una nota */
	const MIN_MS = 700;
	/** ~2,4 MB a 32 kbit/s: resta sotto il limite di Vercel (4,5 MB) */
	const MAX_MS = 10 * 60 * 1000;
	const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

	let phase = $state<'idle' | 'starting' | 'recording'>('idle');
	let elapsed = $state(0);
	let level = $state(0);
	let allowed = $state(false);
	let dialog = $state<HTMLDialogElement>();
	let consentError = $state('');
	let consentBusy = $state(false);
	const hasConsent = $derived(consent || allowed);

	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let audioCtx: AudioContext | null = null;
	let chunks: Blob[] = [];
	let startedAt = 0;
	let tick: ReturnType<typeof setInterval> | undefined;
	let frame = 0;
	let pressAt = 0;
	let skipClick = false;

	const clock = (ms: number) => {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};

	function pickType() {
		if (typeof MediaRecorder === 'undefined') return null;
		return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
	}

	async function start() {
		if (phase !== 'idle') return;
		const type = pickType();
		if (type === null || !navigator.mediaDevices?.getUserMedia) {
			outbox.notify('Questo browser non può registrare audio.');
			return;
		}
		phase = 'starting';
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
			});
		} catch {
			phase = 'idle';
			outbox.notify(
				'Microfono non disponibile: consenti l’accesso nelle impostazioni del browser.'
			);
			return;
		}
		// annullata (o pagina chiusa) mentre si aspettava il microfono
		if (phase !== 'starting') {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
			return;
		}
		chunks = [];
		recorder = new MediaRecorder(stream, {
			...(type ? { mimeType: type } : {}),
			audioBitsPerSecond: 32_000
		});
		recorder.ondataavailable = (e) => {
			if (e.data.size) chunks.push(e.data);
		};
		recorder.start(1000);
		startedAt = performance.now();
		elapsed = 0;
		phase = 'recording';
		navigator.vibrate?.(25);
		tick = setInterval(() => {
			elapsed = performance.now() - startedAt;
			if (elapsed >= MAX_MS) stop(true);
		}, 200);
		meter(stream);
	}

	/** Livello del microfono, per far vedere che sta ascoltando. */
	function meter(source: MediaStream) {
		try {
			audioCtx = new AudioContext();
			void audioCtx.resume();
			const analyser = audioCtx.createAnalyser();
			analyser.fftSize = 256;
			audioCtx.createMediaStreamSource(source).connect(analyser);
			const data = new Uint8Array(analyser.fftSize);
			const loop = () => {
				analyser.getByteTimeDomainData(data);
				let peak = 0;
				for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
				level = level * 0.6 + Math.min(1, peak / 64) * 0.4;
				frame = requestAnimationFrame(loop);
			};
			loop();
		} catch {
			// senza Web Audio si registra lo stesso
		}
	}

	function cleanup() {
		clearInterval(tick);
		cancelAnimationFrame(frame);
		stream?.getTracks().forEach((t) => t.stop());
		void audioCtx?.close().catch(() => undefined);
		stream = null;
		audioCtx = null;
		recorder = null;
		level = 0;
		phase = 'idle';
	}

	function stop(save: boolean) {
		if (phase === 'starting') {
			phase = 'idle';
			return;
		}
		const rec = recorder;
		if (!rec || phase !== 'recording') return;
		const durationMs = Math.round(performance.now() - startedAt);
		const type = rec.mimeType || 'audio/webm';
		rec.onstop = () => {
			const audio = new Blob(chunks, { type });
			chunks = [];
			if (!save) return;
			if (durationMs < MIN_MS || !audio.size) {
				outbox.notify('Registrazione troppo breve: tieni premuto o tocca di nuovo per fermare.');
				return;
			}
			void outbox.voiceNote({
				noteId: newId(),
				attachmentId: newId(),
				day,
				audio,
				durationMs
			});
			outbox.notify(
				navigator.onLine
					? 'Nota vocale salvata: trascrizione in corso…'
					: 'Nota vocale salvata: verrà trascritta appena torna la connessione.'
			);
		};
		rec.stop();
		navigator.vibrate?.(15);
		cleanup();
	}

	// --- Tocco, pressione lunga e tastiera ---

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0 || !hasConsent || phase !== 'idle') return;
		pressAt = Date.now();
		skipClick = true;
		void start();
	}

	function onpointerup() {
		if (pressAt && Date.now() - pressAt > HOLD_MS && phase === 'recording') stop(true);
		pressAt = 0;
	}

	function onclick() {
		// il tocco che ha avviato la registrazione (gestito da pointerdown)
		if (skipClick) {
			skipClick = false;
			return;
		}
		if (!hasConsent) {
			consentError = '';
			dialog?.showModal();
		} else if (phase === 'idle') void start();
		else if (phase === 'recording') stop(true);
	}

	async function giveConsent() {
		consentBusy = true;
		consentError = '';
		try {
			const res = await fetch('/api/voice/consent', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ allow: true })
			});
			if (!res.ok) throw new Error();
			allowed = true;
			dialog?.close();
			void invalidateAll();
			void start();
		} catch {
			consentError = 'Non riuscito: serve la connessione per dare il consenso.';
		} finally {
			consentBusy = false;
		}
	}

	// uscendo dalla pagina mentre registra la nota si salva comunque
	onDestroy(() => stop(true));
</script>

<div class="voice" class:on={phase !== 'idle'}>
	{#if phase !== 'idle'}
		<div class="voice-bar" role="status" aria-live="polite">
			<button
				class="voice-cancel"
				aria-label="Annulla la registrazione"
				onclick={() => stop(false)}
			>
				<X size={20} aria-hidden="true" />
			</button>
			<span class="voice-dot" aria-hidden="true"></span>
			<span class="voice-time">
				{phase === 'starting' ? 'Avvio…' : clock(elapsed)}
				<span class="sr-only">Registrazione in corso</span>
			</span>
			<span class="voice-level" aria-hidden="true">
				{#each [0.15, 0.35, 0.55, 0.75, 0.9] as threshold (threshold)}
					<span class:lit={level >= threshold * 0.6}></span>
				{/each}
			</span>
		</div>
	{/if}
	<button
		class="voice-fab"
		aria-label={phase === 'recording'
			? 'Ferma e salva la nota vocale'
			: 'Nota vocale: tocca per registrare, tieni premuto per parlare'}
		aria-pressed={phase !== 'idle'}
		{onpointerdown}
		{onpointerup}
		onpointercancel={onpointerup}
		{onclick}
		oncontextmenu={(e) => e.preventDefault()}
	>
		{#if phase === 'idle'}
			<Mic size={26} strokeWidth={2.4} aria-hidden="true" />
		{:else}
			<Square size={20} fill="currentColor" aria-hidden="true" />
		{/if}
	</button>
</div>

<dialog
	bind:this={dialog}
	class="voice-dialog panel-top text-volt"
	aria-labelledby="voice-consent-title"
>
	<div class="flex flex-col gap-3 text-ink">
		<h2 id="voice-consent-title" class="lbl text-[13px] font-bold text-volt">Note vocali</h2>
		<p class="text-[15px] leading-relaxed">
			Le note vocali vengono trascritte da <strong>Google Gemini</strong>: l'audio viene inviato a
			Google e il testo torna nella nota, con l'audio in allegato.
		</p>
		<p class="text-[14px] leading-relaxed text-soft">
			Nel piano gratuito dell'API Google può usare audio e testo per migliorare i propri prodotti.
			Puoi togliere il consenso dal Profilo ed eliminare l'audio da ogni nota.
		</p>
		{#if consentError}
			<p class="text-sm font-semibold text-alert" role="alert">{consentError}</p>
		{/if}
		<div class="mt-1 flex flex-wrap justify-end gap-2">
			<button class="btn" onclick={() => dialog?.close()}>Annulla</button>
			<button class="btn-primary" disabled={consentBusy} onclick={giveConsent}>
				<Mic size={18} aria-hidden="true" /> Consenti e registra
			</button>
		</div>
	</div>
</dialog>

<style>
	.voice {
		position: fixed;
		right: 16px;
		/* sopra il pulsante "Nuova nota" della home (60 px + 12 px di spazio) */
		bottom: calc(76px + 72px + env(safe-area-inset-bottom));
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	@media (min-width: 600px) {
		.voice {
			right: 24px;
			bottom: 96px;
		}
	}
	.voice-fab {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 60px;
		background: var(--color-volt);
		color: var(--color-void);
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
		box-shadow: 0 0 0 1px var(--color-void);
		cursor: pointer;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.voice-fab:hover {
		background: #fff35c;
	}
	.on .voice-fab {
		background: var(--color-alert);
		color: #fff;
	}
	.voice-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 60px;
		padding: 0 14px 0 4px;
		border: 1px solid var(--color-alert);
		background: var(--color-void);
		color: var(--color-ink);
	}
	.voice-cancel {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		color: var(--color-dim);
		cursor: pointer;
	}
	.voice-cancel:hover {
		color: var(--color-ink);
	}
	.voice-dot {
		width: 10px;
		height: 10px;
		background: var(--color-alert);
		animation: blink 1s steps(2, start) infinite;
	}
	.voice-time {
		min-width: 44px;
		font-size: 18px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.voice-level {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 22px;
	}
	.voice-level span {
		width: 4px;
		background: var(--color-line);
	}
	.voice-level span:nth-child(1) {
		height: 6px;
	}
	.voice-level span:nth-child(2) {
		height: 10px;
	}
	.voice-level span:nth-child(3) {
		height: 14px;
	}
	.voice-level span:nth-child(4) {
		height: 18px;
	}
	.voice-level span:nth-child(5) {
		height: 22px;
	}
	.voice-level span.lit {
		background: var(--color-neon);
	}
	.voice-dialog {
		margin: auto;
		width: min(440px, calc(100vw - 32px));
		padding: 18px 16px 16px;
		background: var(--color-void);
	}
	.voice-dialog::backdrop {
		background: rgb(0 0 0 / 0.75);
	}
	@keyframes blink {
		to {
			visibility: hidden;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.voice-dot {
			animation: none;
		}
	}
</style>
