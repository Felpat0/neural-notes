// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '#lib/server/auth.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: User | null;
			/** hash del token della sessione corrente, per "esci dagli altri dispositivi" */
			sessionId: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
