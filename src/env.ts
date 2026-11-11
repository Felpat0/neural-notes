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
		description: 'Segreto richiesto da /api/cron/notify e /api/cron/google (cron-job.org).',
		schema: optional
	},
	// Google: accesso con Google e Google Calendar. Senza client OAuth restano nascosti.
	GOOGLE_CLIENT_ID: { description: 'Client OAuth "Web" (Google Cloud Console).', schema: optional },
	GOOGLE_CLIENT_SECRET: { description: 'Segreto del client OAuth.', schema: optional },
	GOOGLE_TOKEN_KEY: {
		description:
			'32 byte casuali in base64, per cifrare i token di Google Calendar nel DB (senza: niente Calendar).',
		schema: optional
	},
	// AI: senza chiave le funzioni AI (e le note vocali) restano nascoste.
	GEMINI_API_KEY: {
		description: 'Chiave dell’API Gemini (aistudio.google.com).',
		schema: optional
	},
	GEMINI_MODELS: {
		description:
			'Modelli per testo e trascrizioni, in ordine: si passa al successivo se uno è esaurito o non risponde (default gemini-2.5-flash,gemini-2.5-flash-lite).',
		schema: optional
	},
	GEMINI_API_BASE: {
		description: 'Solo per i test in locale: un finto server Gemini al posto di quello vero.',
		schema: optional
	},
	// Allegati (audio delle note vocali): Vercel Blob con accesso privato. In locale, senza token,
	// i file vanno nella cartella .attachments/.
	BLOB_READ_WRITE_TOKEN: {
		description: 'Token dello store Vercel Blob (creato collegando uno store Blob al progetto).',
		schema: optional
	},
	GOOGLE_API_BASE: {
		description: 'Solo per i test in locale: un finto server Google al posto di quelli veri.',
		schema: optional
	}
});
