// Service worker: notifiche push. La cache per l'uso offline arriva con la fase 8.
import { self } from '$app/service-worker';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

type PushData = { title: string; body: string; url: string; tag?: string };

self.addEventListener('push', (event) => {
	const data: PushData = event.data?.json() ?? { title: 'NEURAL//NOTES', body: '', url: '/' };
	event.waitUntil(
		self.registration.showNotification(data.title, {
			body: data.body,
			tag: data.tag,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: data.url }
		})
	);
});

// tocco sulla notifica: apre la nota o il giorno, riusando una finestra dell'app se c'è
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL(
		(event.notification.data as { url?: string })?.url ?? '/',
		self.location.origin
	).href;
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
			if (open) {
				await open.focus();
				return open.navigate(url);
			}
			return self.clients.openWindow(url);
		})()
	);
});
