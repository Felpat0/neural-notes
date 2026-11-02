import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Connection string di Neon Postgres (o pglite:./.pglite in locale).'
	},
	PUBLIC_APP_URL: {
		public: true,
		description:
			"Indirizzo pubblico dell'app, per i link nelle email (es. https://neural-notes.vercel.app).",
		schema: optional
	},
	// Registrazione: aperta (default), chiusa, oppure aperta solo con il codice d'invito.
	SIGNUP_MODE: {
		description: 'open (default) | closed',
		schema: (value) => (value === 'closed' ? 'closed' : 'open')
	},
	SIGNUP_CODE: { description: 'Se impostato, codice richiesto per registrarsi.', schema: optional },
	// Email: senza SMTP_URL le email vengono stampate nel log del server.
	SMTP_URL: {
		description:
			'smtps://utente%40gmail.com:<password-per-le-app>@smtp.gmail.com:465 (Gmail con password per le app).',
		schema: optional
	},
	MAIL_FROM: {
		description: 'Mittente, es. "NEURAL//NOTES <utente@gmail.com>" (stesso account di SMTP_URL).',
		schema: optional
	},
	// Notifiche push: senza queste variabili le notifiche restano disattivate.
	PUBLIC_VAPID_KEY: {
		public: true,
		description: 'Chiave pubblica VAPID (npx web-push generate-vapid-keys).',
		schema: optional
	},
	VAPID_PRIVATE_KEY: { description: 'Chiave privata VAPID.', schema: optional },
	VAPID_SUBJECT: {
		description: "Contatto VAPID: un URL https dell'app o un indirizzo mailto:.",
		schema: optional
	},
	CRON_SECRET: {
		description: 'Segreto richiesto da /api/cron/notify (chiamato ogni minuto da cron-job.org).',
		schema: optional
	}
});
