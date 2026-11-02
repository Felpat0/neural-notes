// Database locale per lo sviluppo offline: DATABASE_URL="pglite:./.pglite"
// Alla prima apertura applica le migrazioni; a ogni avvio quelle nuove.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

export async function createLocalDb(url: string) {
	const dataDir = url.slice('pglite:'.length) || './.pglite';
	const client = new PGlite(dataDir);
	const db = drizzle(client, { schema });
	// PGlite non ha batch(): stessa semantica eseguendo in sequenza.
	Object.assign(db, {
		batch: async (queries: PromiseLike<unknown>[]) => {
			const results = [];
			for (const q of queries) results.push(await q);
			return results;
		}
	});

	await client.exec('create table if not exists _local_migrations (name text primary key)');
	const done = new Set(
		(await client.query<{ name: string }>('select name from _local_migrations')).rows.map(
			(r) => r.name
		)
	);
	if (existsSync('drizzle'))
		for (const file of readdirSync('drizzle')
			.filter((f) => f.endsWith('.sql') && !done.has(f))
			.sort()) {
			for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split(
				'--> statement-breakpoint'
			))
				await client.exec(statement);
			await client.query('insert into _local_migrations (name) values ($1)', [file]);
		}
	await db.execute(sql`select 1`);
	return db;
}
