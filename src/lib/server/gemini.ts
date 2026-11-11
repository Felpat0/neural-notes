// Chiamate a Gemini: REST diretto (niente SDK), con i modelli di riserva quando uno ha la quota
// esaurita o non risponde. I modelli si scelgono con GEMINI_MODELS (in seguito dalla pagina dei
// modelli, in app_setting).
import { GEMINI_API_BASE, GEMINI_API_KEY, GEMINI_MODELS } from '$app/env/private';

const BASE = GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const TIMEOUT = 45_000;

export const geminiEnabled = () => !!GEMINI_API_KEY;

const models = () =>
	GEMINI_MODELS
		? GEMINI_MODELS.split(',')
				.map((m) => m.trim())
				.filter(Boolean)
		: DEFAULT_MODELS;

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
	for (const model of models()) {
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
			last = new GeminiError(reason(response.status, body), response.status);
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
