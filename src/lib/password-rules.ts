// Regole della password condivise tra server e moduli (niente import da node:crypto).
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

// Le più usate (elenchi pubblici di password trapelate), anche con iniziale maiuscola.
const COMMON = new Set([
	'1234567890',
	'0123456789',
	'1234567891',
	'qwertyuiop',
	'password12',
	'password123',
	'password1234',
	'passwordpassword',
	'iloveyou12',
	'qwerty1234',
	'qwerty12345',
	'1q2w3e4r5t',
	'1qaz2wsx3edc',
	'asdfghjkl1',
	'abcdefghij',
	'abc1234567',
	'aaaaaaaaaa',
	'1111111111',
	'0000000000',
	'forzainter',
	'forzamilan',
	'forzajuve1',
	'juventus1897',
	'ciaociao12',
	'passworddd',
	'amoremio12',
	'mypassword',
	'letmein123',
	'welcome123',
	'football12',
	'princess12',
	'sunshine12',
	'trustno1234'
]);

export const isCommonPassword = (password: string) => COMMON.has(password.toLowerCase());

/** Robustezza da 0 a 4, per l'indicatore a tacche. */
export function passwordStrength(password: string) {
	if (password.length < MIN_PASSWORD_LENGTH || isCommonPassword(password)) return 0;
	const unique = new Set(password).size;
	if (unique < 4) return 0;
	let score = 1;
	if (password.length >= 14) score++;
	if (password.length >= 18) score++;
	const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(password)).length;
	if (kinds >= 3 || (kinds >= 2 && password.length >= 12)) score++;
	return Math.min(4, score);
}

export const STRENGTH_LABELS = ['Troppo debole', 'Sufficiente', 'Buona', 'Buona', 'Ottima'];

/** Messaggio d'errore, o null se la password va bene. */
export function passwordProblem(password: string) {
	if (password.length < MIN_PASSWORD_LENGTH)
		return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
	if (password.length > MAX_PASSWORD_LENGTH) return 'La password è troppo lunga.';
	if (isCommonPassword(password) || new Set(password).size < 4)
		return 'Questa password è troppo comune: prova con una frase.';
	return null;
}
