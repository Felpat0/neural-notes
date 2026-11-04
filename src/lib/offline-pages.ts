// Pagine salvate dal service worker per l'uso offline: nome della cache e chiavi, usati sia dal
// service worker sia dalle pagine (per sapere se una pagina si può aprire senza rete).
import { version } from '$app/env';

/** Una cache per versione: le pagine vecchie usano file dell'app che con l'aggiornamento spariscono. */
export const pagesCache = (v: string) => `pages-${v}`;

/** Parametri che non cambiano i dati della pagina: fuori dalla chiave (una copia sola). */
const IGNORED = ['x-sveltekit-invalidated', 'eliminata', 'benvenuto', 'full'];

/** Chiave in cache di una pagina o dei suoi dati (__data.json). */
export function cacheKey(url: URL) {
	const key = new URL(url.pathname, url.origin);
	for (const [name, value] of url.searchParams)
		if (!IGNORED.includes(name)) key.searchParams.append(name, value);
	key.searchParams.sort();
	return key.href;
}

/** Chiede al service worker di salvare queste pagine (se mancano o sono vecchie di un'ora). */
export function warmPages(paths: string[]) {
	navigator.serviceWorker?.ready
		.then((registration) => registration.active?.postMessage({ type: 'warm', paths }))
		.catch(() => undefined);
}

/** Uscita dall'account: via le pagine salvate (contengono i dati dell'utente). */
export function forgetPages() {
	caches
		?.keys()
		.then((keys) => keys.filter((k) => k.startsWith('pages-')).forEach((k) => caches.delete(k)))
		.catch(() => undefined);
}

/** I dati della pagina (per la navigazione nell'app) sono in cache? */
export async function isCached(path: string) {
	try {
		const url = new URL(path === '/' ? '/__data.json' : `${path}/__data.json`, location.origin);
		const cache = await caches.open(pagesCache(version));
		return !!(await cache.match(cacheKey(url)));
	} catch {
		return false;
	}
}
