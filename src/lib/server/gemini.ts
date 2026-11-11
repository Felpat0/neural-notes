// Chiamate a Gemini: REST diretto (niente SDK), con i modelli di riserva quando uno ha la quota
// esaurita o non risponde. I modelli si possono fissare con GEMINI_MODELS (in seguito dalla pagina
// dei modelli, in app_setting); altrimenti si scelgono da soli tra quelli che l'API offre, così
// un modello ritirato da Google non blocca l'app.
import { GEMINI_API_BASE, GEMINI_API_KEY, GEMINI_MODELS } from '$app/env/private';

const BASE = GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
/** Alias di Google che seguono sempre l'ultima versione: se l'elenco dei modelli non risponde. */
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const TIMEOUT = 45_000;
const LIST_TTL = 6 * 60 * 60 * 1000;

export const geminiEnabled = () => !!GEMINI_API_KEY;

/** Versione nel nome ("gemini-3.1-flash" → [3, 1]), per mettere prima i più recenti. */
const version = (name: string) =>
	(name.match(/^gemini-(\d+)(?:\.(\d+))?/) ?? []).slice(1).map(Number);
const newerFirst = (a: string, b: string) => {
	const [va, vb] = [version(a), version(b)];
	return (vb[0] || 0) - (va[0] || 0) || (vb[1] || 0) - (va[1] || 0);
};

let cached: { at: number; models: string[] } | null = null;

/**
 * Modelli scelti dall'elenco dell'API: il Flash stabile più recente, poi il Flash-Lite più
 * recente, poi gli alias "-latest". Solo modelli stabili (senza preview/exp/date nel nome).
 */
async function autoModels(): Promise<string[]> {
	if (cached && Date.now() - cached.at < LIST_TTL) return cached.models;
	let names: string[] = [];
	try {
		const response = await fetch(`${BASE}/models?pageSize=1000`, {
			headers: { 'x-goog-api-key': GEMINI_API_KEY! },
			signal: AbortSignal.timeout(5000)
		});
		if (response.ok) {
			const { models = [] } = (await response.json()) as {
				models?: { name: string; supportedGenerationMethods?: string[] }[];
			};
			names = models
				.filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
				.map((m) => m.name.replace(/^models\//, ''));
		}
	} catch {
		// si usano gli alias
	}
	const pick = (re: RegExp) => names.filter((n) => re.test(n)).sort(newerFirst)[0];
	const flash = pick(/^gemini-\d+(\.\d+)?-flash$/);
	const lite = pick(/^gemini-\d+(\.\d+)?-flash-lite$/);
	const list = [
		...new Set([flash, lite, ...FALLBACK_MODELS].filter((m): m is string => !!m))
	].filter((m) => !names.length || names.includes(m) || !m.startsWith('gemini-flash'));
	const models = list.length ? list : FALLBACK_MODELS;
	// un elenco vuoto (API non raggiungibile) non si tiene: si riprova alla prossima richiesta
	if (names.length) cached = { at: Date.now(), models };
	return models;
}

async function models() {
	if (GEMINI_MODELS)
		return GEMINI_MODELS.split(',')
			.map((m) => m.trim())
			.filter(Boolean);
	return autoModels();
}

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export class GeminiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

/** Messaggio leggibile per l'utente. */
function reason(status: number, body: { error?: { message?: string } } | null) {
	if (status === 429) return 'quota di Gemini esaurita per oggi';
	if (status === 404) return 'modello Gemini inesistente o ritirato';
	if (status === 400) return body?.error?.message ?? 'richiesta non valida';
	if (status >= 500) return 'Gemini non risponde';
	return body?.error?.message ?? `errore ${status}`;
}

/**
 * Risposta JSON secondo `schema` (responseSchema di Gemini). Prova i modelli in ordine: con 429,
 * 404, 5xx o timeout passa al successivo; gli altri errori si fermano subito.
 */
export async function generateJson<T>(input: {
	system: string;
	parts: Part[];
	schema: Record<string, unknown>;
	temperature?: number;
}): Promise<{ data: T; model: string }> {
	if (!GEMINI_API_KEY) throw new GeminiError('GEMINI_API_KEY non impostata', 503);
	let last: GeminiError | null = null;
	for (const model of await models()) {
		let response: Response;
		try {
			response = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
				method: 'POST',
				headers: { 'x-goog-api-key': GEMINI_API_KEY, 'content-type': 'application/json' },
				body: JSON.stringify({
					system_instruction: { parts: [{ text: input.system }] },
					contents: [{ role: 'user', parts: input.parts }],
					generationConfig: {
						temperature: input.temperature ?? 0.2,
						responseMimeType: 'application/json',
						responseSchema: input.schema
					}
				}),
				signal: AbortSignal.timeout(TIMEOUT)
			});
		} catch {
			last = new GeminiError('Gemini non risponde', 504);
			continue;
		}
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as {
				error?: { message?: string };
			} | null;
			const message = reason(response.status, body);
			last = new GeminiError(
				response.status === 404 ? `${message} (${model})` : message,
				response.status
			);
			if (response.status === 429 || response.status === 404 || response.status >= 500) continue;
			throw last;
		}
		const body = (await response.json()) as {
			candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
			promptFeedback?: { blockReason?: string };
		};
		const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
		if (!text) {
			const why = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason;
			throw new GeminiError(`risposta vuota da Gemini${why ? ` (${why})` : ''}`, 502);
		}
		try {
			return { data: JSON.parse(text) as T, model };
		} catch {
			throw new GeminiError('risposta di Gemini non leggibile', 502);
		}
	}
	throw last ?? new GeminiError('nessun modello Gemini configurato', 503);
}
