// Invio email. Con SMTP_URL (es. Gmail con una password per le app) parte davvero;
// senza, l'email viene stampata nel log del server con il link, comodo in sviluppo.
import nodemailer, { type Transporter } from 'nodemailer';
import { MAIL_FROM, SMTP_URL } from '$app/env/private';
import { PUBLIC_APP_URL } from '$app/env/public';

export type Mail = { to: string; subject: string; html: string; text: string };

let transporter: Transporter | null = null;

export async function sendMail(mail: Mail) {
	if (!SMTP_URL) {
		console.info(`\n[email] A: ${mail.to}\n[email] Oggetto: ${mail.subject}\n${mail.text}\n`);
		return;
	}
	transporter ??= nodemailer.createTransport(SMTP_URL);
	await transporter.sendMail({ from: MAIL_FROM, ...mail });
}

/** Indirizzo assoluto per i link nelle email: PUBLIC_APP_URL, o l'origine della richiesta. */
export const appUrl = (origin: string, path: string) =>
	new URL(path, PUBLIC_APP_URL || origin).toString();

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Modello comune: fascia gialla con il nome, testo, pulsante giallo e link in chiaro. */
function layout(input: {
	title: string;
	lines: string[];
	button?: { label: string; url: string };
}) {
	const paragraphs = input.lines
		.map(
			(l) =>
				`<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#e6e6e6">${escape(l)}</p>`
		)
		.join('');
	const button = input.button
		? `<p style="margin:22px 0"><a href="${escape(input.button.url)}" style="display:inline-block;background:#fcee0a;color:#000;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:14px 22px;font-size:14px">${escape(input.button.label)}</a></p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#a6a6a6">Se il pulsante non funziona, copia questo indirizzo nel browser:<br><a href="${escape(input.button.url)}" style="color:#00f0ff;word-break:break-all">${escape(input.button.url)}</a></p>`
		: '';
	const html = `<!doctype html><html lang="it"><body style="margin:0;background:#000;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto">
<div style="background:#fcee0a;color:#000;padding:18px 24px;font-weight:700;letter-spacing:3px;font-size:14px">NEURAL//NOTES</div>
<div style="padding:28px 24px;border:1px solid #fcee0a;border-top:0">
<h1 style="margin:0 0 18px;font-size:22px;text-transform:uppercase;color:#fcee0a">${escape(input.title)}</h1>
${paragraphs}${button}
</div></div></body></html>`;
	const text = [
		input.title.toUpperCase(),
		'',
		...input.lines,
		...(input.button ? ['', `${input.button.label}: ${input.button.url}`] : [])
	].join('\n');
	return { html, text };
}

export const verifyEmail = (to: string, name: string, url: string): Mail => ({
	to,
	subject: "Conferma l'indirizzo email",
	...layout({
		title: "Conferma l'email",
		lines: [
			`Ciao ${name},`,
			'conferma che questo indirizzo è tuo. Il link vale 24 ore.',
			'Se non hai creato un account su NEURAL//NOTES ignora questa email.'
		],
		button: { label: 'Conferma email', url }
	})
});

export const resetEmail = (to: string, name: string, url: string): Mail => ({
	to,
	subject: 'Nuova password',
	...layout({
		title: 'Nuova password',
		lines: [
			`Ciao ${name},`,
			'qualcuno (speriamo tu) ha chiesto di cambiare la password del tuo account. Il link vale un’ora e si usa una volta sola.',
			'Se non sei stato tu ignora questa email: la password resta quella di prima.'
		],
		button: { label: 'Scegli la nuova password', url }
	})
});

export const passwordChangedEmail = (to: string, name: string, url: string): Mail => ({
	to,
	subject: 'La tua password è stata cambiata',
	...layout({
		title: 'Password cambiata',
		lines: [
			`Ciao ${name},`,
			'la password del tuo account è appena stata cambiata.',
			'Se non sei stato tu, chiedi subito un link per sceglierne una nuova.'
		],
		button: { label: 'Password dimenticata', url }
	})
});

/** Registrazione con un indirizzo già usato: avvisiamo il proprietario invece di dirlo a chi prova. */
export const signupAttemptEmail = (to: string, name: string, loginUrl: string): Mail => ({
	to,
	subject: 'Tentativo di registrazione con il tuo indirizzo',
	...layout({
		title: 'Hai già un account',
		lines: [
			`Ciao ${name},`,
			'qualcuno ha provato a creare un account NEURAL//NOTES con questo indirizzo, che è già registrato.',
			'Se eri tu, accedi; se non ricordi la password puoi sceglierne una nuova dalla pagina di accesso. Altrimenti ignora questa email.'
		],
		button: { label: 'Accedi', url: loginUrl }
	})
});
