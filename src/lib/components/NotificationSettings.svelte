<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, BellOff, Send } from '@lucide/svelte';
	import { PUBLIC_VAPID_KEY } from '$app/env/public';

	// Notifiche su questo dispositivo: attivazione, prova, disattivazione (come in japan-trip).
	type Status = 'loading' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';
	let status = $state<Status>('loading');
	let busy = $state(false);
	let message = $state('');

	const toKey = (base64: string) => {
		const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
			.replace(/-/g, '+')
			.replace(/_/g, '/');
		return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
	};

	async function currentSubscription() {
		const registration = await navigator.serviceWorker.ready;
		return registration.pushManager.getSubscription();
	}

	onMount(async () => {
		const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		const supported =
			'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
		if (!PUBLIC_VAPID_KEY) status = 'unsupported';
		else if (ios && !standalone) status = 'needs-install';
		else if (!supported || !isSecureContext) status = 'unsupported';
		else if (Notification.permission === 'denied') status = 'denied';
		else {
			const subscription = await currentSubscription();
			status = subscription ? 'on' : 'off';
			// riallinea il dispositivo all'account (se le chiavi o l'utente sono cambiati)
			if (subscription) save(subscription, false).catch(() => {});
		}
	});

	async function save(subscription: PushSubscription, test: boolean) {
		const response = await fetch('/api/push', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...subscription.toJSON(), test })
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { message?: string } | null;
			throw new Error(body?.message ?? `Errore ${response.status}`);
		}
	}

	async function enable() {
		busy = true;
		message = '';
		try {
			if ((await Notification.requestPermission()) !== 'granted') {
				status = 'denied';
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: toKey(PUBLIC_VAPID_KEY!)
			});
			await save(subscription, true);
			status = 'on';
			message = 'Attivate: dovresti ricevere subito una notifica di prova.';
		} catch (e) {
			message = `Non riuscito: ${(e as Error).message}`;
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		message = '';
		try {
			const subscription = await currentSubscription();
			if (subscription) {
				await fetch('/api/push', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: subscription.endpoint })
				});
				await subscription.unsubscribe();
			}
			status = 'off';
		} finally {
			busy = false;
		}
	}

	async function test() {
		busy = true;
		message = '';
		try {
			const subscription = await currentSubscription();
			if (subscription) await save(subscription, true);
			message = 'Notifica di prova inviata.';
		} catch (e) {
			message = `Non riuscito: ${(e as Error).message}`;
		} finally {
			busy = false;
		}
	}
</script>

<section class="frame flex flex-col gap-3 px-4 pt-5 pb-4.5" aria-labelledby="notif-title">
	<h2 id="notif-title" class="ml-3 text-xl font-bold text-volt uppercase">Notifiche</h2>
	{#if status === 'loading'}
		<p class="text-[15px] text-dim">Controllo le notifiche…</p>
	{:else if status === 'needs-install'}
		<p class="text-[15px] leading-relaxed text-soft">
			Su iPhone le notifiche funzionano solo con l'app installata: in Safari tocca
			<strong class="text-white">Condividi</strong> →
			<strong class="text-white">Aggiungi alla schermata Home</strong>, apri NEURAL//NOTES
			dall'icona e torna qui.
		</p>
	{:else if status === 'unsupported'}
		<p class="text-[15px] leading-relaxed text-dim">
			Notifiche non disponibili su questo dispositivo, non configurate sul server, o pagina aperta
			senza https.
		</p>
	{:else if status === 'denied'}
		<p class="text-[15px] leading-relaxed text-soft">
			Le notifiche sono bloccate per questo sito. Riattivale dalle impostazioni del browser o del
			telefono, poi ricarica la pagina.
		</p>
	{:else if status === 'on'}
		<p class="flex items-center gap-2 font-bold text-neon">
			<Bell size={18} aria-hidden="true" /> Attive su questo dispositivo
		</p>
		<p class="text-[15px] leading-relaxed text-soft">
			Arrivano all'ora dei promemoria di todo e note (con un minuto circa di margine). Un todo
			spuntato prima non suona.
		</p>
		<div class="grid grid-cols-2 gap-2">
			<button type="button" class="btn-outline" onclick={test} disabled={busy}>
				<Send size={16} aria-hidden="true" /> Prova
			</button>
			<button type="button" class="btn" onclick={disable} disabled={busy}>
				<BellOff size={16} aria-hidden="true" /> Disattiva
			</button>
		</div>
	{:else}
		<p class="text-[15px] leading-relaxed text-soft">
			Ricevi su questo dispositivo i promemoria di todo e note.
		</p>
		<button type="button" class="btn-primary" onclick={enable} disabled={busy}>
			<Bell size={18} aria-hidden="true" /> Attiva le notifiche
		</button>
	{/if}
	{#if message}<p class="text-sm text-soft" role="status">{message}</p>{/if}
</section>
