/**
 * Query string con alcuni parametri cambiati (null o '' = tolto): "?a=1&b=2", o "" se vuota.
 * Fuori dai componenti, così è chiaro che è un calcolo e non uno stato da osservare.
 */
export function editQuery(
	search: string | URLSearchParams,
	changes: Record<string, string | number | null>
) {
	const params = new URLSearchParams(search);
	for (const [key, value] of Object.entries(changes)) {
		if (value === null || value === '') params.delete(key);
		else params.set(key, String(value));
	}
	const query = params.toString();
	return query ? `?${query}` : '';
}
