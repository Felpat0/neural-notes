import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	// `generate` non ha bisogno del DB; `migrate`/`push` sì.
	dbCredentials: { url: process.env.DATABASE_URL ?? '' },
	verbose: true,
	strict: true
});
