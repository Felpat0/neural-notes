// Applica le migrazioni di drizzle/ al database di DATABASE_URL (Neon), via HTTP come l'app.
// (drizzle-kit migrate usa il websocket e, se fallisce, non mostra l'errore.)
// Uso: pnpm db:migrate            → applica quelle mancanti
//      pnpm db:migrate --baseline → per un database creato con "db:push": segna la prima
//                                   migrazione come già applicata, poi applica le altre
import { existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url || url.startsWith('pglite:')) {
	console.error(
		"DATABASE_URL deve puntare a Neon. In locale (pglite:) le migrazioni si applicano da sole all'avvio."
	);
	process.exit(1);
}

const sql = neon(url);
const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' });
console.log(`Database: ${new URL(url).host} · migrazioni nel progetto: ${migrations.length}`);

try {
	await sql`create schema if not exists drizzle`;
	await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
	const applied =
		await sql`select created_at from drizzle.__drizzle_migrations order by created_at`;

	if (process.argv.includes('--baseline')) {
		if (applied.length) {
			console.error(
				'--baseline serve solo se non risulta applicata nessuna migrazione: niente da fare.'
			);
			process.exit(1);
		}
		const [{ exists }] = await sql`select to_regclass('public.user') is not null as exists`;
		if (!exists) {
			console.error('La tabella "user" non esiste: il database è vuoto, basta "pnpm db:migrate".');
			process.exit(1);
		}
		const [first] = migrations;
		await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${first.hash}, ${first.folderMillis})`;
		console.log('Prima migrazione segnata come già applicata (tabelle create con db:push).');
	}

	await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
	const [{ n }] = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
	console.log(`Fatto: ${n}/${migrations.length} migrazioni applicate.`);
} catch (e) {
	const message = [e.message, e.cause?.message].filter(Boolean).join(' · ');
	console.error(`Migrazione non riuscita: ${message}`);
	if (/already exists/i.test(message))
		console.error(
			'Le tabelle esistono già ma non risultano migrazioni applicate (database creato con "db:push"?).\n' +
				'Se è così: pnpm db:migrate --baseline'
		);
	process.exit(1);
}
