import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';
import { dev } from '$app/env';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const createDb = () => drizzle(neon(DATABASE_URL), { schema });

// In sviluppo si può usare un Postgres locale (PGlite) con DATABASE_URL="pglite:./.pglite".
export const db: ReturnType<typeof createDb> =
	dev && DATABASE_URL.startsWith('pglite:')
		? ((await (await import('./local')).createLocalDb(DATABASE_URL)) as unknown as ReturnType<
				typeof createDb
			>)
		: createDb();

export { schema };
