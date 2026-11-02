// Formattazioni condivise tra pagine (date, dispositivi).

/** Browser e sistema da uno user agent, abbastanza per riconoscere un dispositivo. */
export function describeAgent(ua: string | null) {
	if (!ua) return 'Dispositivo sconosciuto';
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /SamsungBrowser/.test(ua)
			? 'Samsung Internet'
			: /Firefox\//.test(ua)
				? 'Firefox'
				: /Chrome\//.test(ua)
					? 'Chrome'
					: /Safari\//.test(ua)
						? 'Safari'
						: 'Browser';
	const os = /Android/.test(ua)
		? 'Android'
		: /iPhone|iPad|iPod/.test(ua)
			? 'iOS'
			: /Windows/.test(ua)
				? 'Windows'
				: /Mac OS X/.test(ua)
					? 'macOS'
					: /Linux/.test(ua)
						? 'Linux'
						: '';
	return os ? `${browser} · ${os}` : browser;
}

export const dateTime = (d: Date | string, timeZone?: string) =>
	new Intl.DateTimeFormat('it', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone
	}).format(new Date(d));

/** Data di oggi (AAAA-MM-GG) nel fuso indicato. */
export const todayIn = (timeZone: string, now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);

/** Giorno successivo/precedente di una data AAAA-MM-GG. */
export function addDays(day: string, n: number) {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** I sette giorni (lun–dom) della settimana che contiene `day`. */
export function weekOf(day: string) {
	const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // lunedì = 0
	const monday = addDays(day, -weekday);
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MONTHS_SHORT = [
	'Gen',
	'Feb',
	'Mar',
	'Apr',
	'Mag',
	'Giu',
	'Lug',
	'Ago',
	'Set',
	'Ott',
	'Nov',
	'Dic'
];

export const weekdayName = (day: string) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
export const weekdayShort = (day: string) => weekdayName(day).slice(0, 3).toUpperCase();
export const dayNumber = (day: string) => day.slice(8, 10);
export const monthShort = (day: string) => MONTHS_SHORT[Number(day.slice(5, 7)) - 1];
