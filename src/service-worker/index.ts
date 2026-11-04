// Service worker: uso offline e notifiche push.
// - file dell'app e statici: salvati all'installazione, dalla cache (cambiano nome a ogni build)
// - pagine e dati (__data.json): dalla rete, salvando l'ultima versione; senza rete, o con una
//   rete che non risponde entro qualche secondo, quella salvata
// Le modifiche fatte offline non passano da qui: le tiene la coda in IndexedDB
// (lib/outbox.svelte.ts), che le invia quando torna la connessione.
import { self } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';
import { cacheKey, pagesCache } from '#lib/offline-pages.ts';

const STATIC_CACHE = `static-${version}`;
const PAGES_CACHE = pagesCache(version);
// i percorsi arrivano relativi ("_app/immutable/…"): assoluti, per confrontarli con quelli chiesti
const PRECACHE = [...immutable, ...assets].map((f) => new URL(f.path, self.location.href).pathname);
const PRECACHED = new Set(PRECACHE);
/** oltre questo tempo senza risposta si usa la copia salvata (rete lenta o che non risponde) */
const NETWORK_TIMEOUT = 4000;
/** pagine principali: salvate dopo l'installazione, così si aprono offline anche se mai viste */
const CORE = ['/', '/note', '/calendario', '/ricorrenti'];
/** copie più vecchie di così si aggiornano quando una pagina chiede di salvarle */
const WARM_MAX_AGE = 60 * 60 * 1000;
const SAVED_AT = 'x-sw-saved-at';

// Mai in cache: API, accesso e account, controllo delle nuove versioni.
const NEVER_CACHE = [
	'/api/',
	'/auth/',
	'/login',
	'/registrati',
	'/password-dimenticata',
	'/reimposta/',
	'/verifica/',
	'/_app/version.json'
];
const DATA_SUFFIX = '/__data.json';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// le pagine delle versioni precedenti usano file che non ci sono più
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
					.filter((k) => k.startsWith('static-') || k.startsWith('pages-'))
					.map((k) => caches.delete(k))
			);
			await self.clients.claim();
			// fuori da waitUntil: l'attivazione (e le richieste delle pagine) non aspetta
			void warm(CORE, 0).catch(() => undefined);
		})()
	);
});

self.addEventListener('message', (event) => {
	const data = event.data as { type?: string; paths?: unknown } | null;
	if (data?.type === 'warm' && Array.isArray(data.paths))
		event.waitUntil(
			warm(
				data.paths.filter((p): p is string => typeof p === 'string' && p.startsWith('/')),
				WARM_MAX_AGE
			).catch(() => undefined)
		);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (NEVER_CACHE.some((p) => url.pathname.startsWith(p))) return;

	if (PRECACHED.has(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}

	if (url.pathname.endsWith(DATA_SUFFIX)) {
		event.respondWith(fromNetworkOrCache(event, dataRequest(url), cacheKey(url), isData));
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(
			fromNetworkOrCache(event, request, cacheKey(url), isPage).catch(() => offlinePage())
		);
		return;
	}

	// altri file dell'app che cambiano senza cambiare nome (es. /_app/env.js, le variabili
	// pubbliche): dalla rete, con la copia salvata per l'offline
	if (url.pathname.startsWith('/_app/'))
		event.respondWith(fromNetworkOrCache(event, request, cacheKey(url), () => true));
});

/**
 * I dati si chiedono sempre completi (tutti i load della pagina, non solo quelli cambiati), così
 * la copia salvata serve qualunque sia la pagina da cui ci si arriva offline.
 */
function dataRequest(url: URL) {
	const full = new URL(url);
	full.searchParams.delete('x-sveltekit-invalidated');
	return new Request(full, { credentials: 'same-origin' });
}

type Check = (response: Response, body: string) => boolean;

const isPage: Check = (response) => !!response.headers.get('content-type')?.includes('text/html');

/** Solo dati veri: non i redirect al login (sessione scaduta) né gli errori, che sono JSON anche loro. */
const isData: Check = (_response, body) => {
	try {
		return (JSON.parse(body.split('\n', 1)[0]) as { type?: string }).type === 'data';
	} catch {
		return false;
	}
};

/** Salva una risposta completa e valida; la restituisce come nuova risposta (il corpo è già letto). */
async function save(cache: Cache, key: string, response: Response, check: Check) {
	if (!response.ok || response.status === 204 || response.redirected || response.type !== 'basic')
		return response;
	const body = await response.text();
	const headers = new Headers(response.headers);
	headers.set(SAVED_AT, String(Date.now()));
	const copy = { status: response.status, statusText: response.statusText, headers };
	if (check(response, body)) await cache.put(key, new Response(body, copy));
	return new Response(body, copy);
}

/** Dalla rete (salvando la copia); se non risponde in tempo o non c'è, la copia salvata. */
async function fromNetworkOrCache(event: FetchEvent, request: Request, key: string, check: Check) {
	const cache = await caches.open(PAGES_CACHE);
	const network = fetch(request).then((response) => save(cache, key, response, check));
	// la copia si aggiorna anche se intanto si è risposto con quella vecchia
	event.waitUntil(network.catch(() => undefined));
	const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT));
	const first = await Promise.race([network, timeout]).catch(() => null);
	if (first) return first;
	const cached = await cache.match(key);
	return cached ?? network;
}

/** Salva le pagine indicate (HTML per la home, dati per tutte) se mancano o sono vecchie. */
async function warm(paths: string[], maxAge: number) {
	const cache = await caches.open(PAGES_CACHE);
	const fresh = async (key: string) => {
		const hit = await cache.match(key);
		return !!hit && Date.now() - Number(hit.headers.get(SAVED_AT) ?? 0) < maxAge;
	};
	for (const path of paths.slice(0, 20)) {
		const page = new URL(path, self.location.origin);
		const data = new URL(path === '/' ? DATA_SUFFIX : `${path}${DATA_SUFFIX}`, page);
		data.search = page.search;
		if (!(await fresh(cacheKey(data))))
			await fetch(dataRequest(data))
				.then((r) => save(cache, cacheKey(data), r, isData))
				.catch(() => undefined);
		// l'HTML serve per aprire l'app da chiusa: si parte dalla home
		if (path === '/' && !(await fresh(cacheKey(page))))
			await fetch(new Request(page, { credentials: 'same-origin' }))
				.then((r) => save(cache, cacheKey(page), r, isPage))
				.catch(() => undefined);
	}
}

/** Pagina mai aperta e niente rete: una spiegazione, con il ritorno alla home (salvata). */
function offlinePage() {
	const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline · NEURAL//NOTES</title>
<style>body{margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;box-sizing:border-box;background:#000;color:#9aa;font:16px system-ui,sans-serif;text-align:center}
h1{color:#f5e400;text-transform:uppercase;margin:0}a{background:#f5e400;color:#000;padding:12px 18px;font-weight:700;text-decoration:none;text-transform:uppercase}</style></head>
<body><h1>Sei offline</h1><p>Questa pagina non è ancora salvata sul dispositivo.<br>Le modifiche fatte restano in coda e partono quando torna la connessione.</p>
<a href="/">Torna a Oggi</a></body></html>`;
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

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
