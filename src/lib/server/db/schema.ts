import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	time,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

// Gli id sono UUID creati dall'app.

/** Ordine a mano nelle liste: di default l'istante di creazione (µs), così i nuovi vanno in fondo. */
const listPosition = () =>
	bigint('position', { mode: 'number' })
		.notNull()
		.default(sql`(extract(epoch from clock_timestamp()) * 1000000)::bigint`);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
	timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

/** Ogni record appartiene a un utente; eliminando l'account si elimina tutto. */
const userId = () =>
	text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' });

// --- Account ---

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	// scrypt$N$r$p$sale$hash (vedi server/password.ts); null per gli account solo Google
	passwordHash: text('password_hash'),
	emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
	googleSub: text('google_sub').unique(),
	timezone: text('timezone').notNull().default('Europe/Rome'),
	// il primo account è admin (modelli AI e impostazioni globali)
	isAdmin: boolean('is_admin').notNull().default(false),
	aiEnabled: boolean('ai_enabled').notNull().default(true),
	// "Consenti l'AI sulle nuove note": spento, le note sono escluse di default
	aiDefaultAllowed: boolean('ai_default_allowed').notNull().default(false),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

/** Sessione di accesso: nel cookie c'è il token, qui solo il suo hash. */
export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		userAgent: text('user_agent'),
		// "Resta collegato": 60 giorni rinnovati a ogni uso; altrimenti cookie di sessione (12 ore)
		remember: boolean('remember').notNull().default(true),
		createdAt: createdAt(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

export const AUTH_TOKEN_KINDS = ['verify', 'reset'] as const;
export type AuthTokenKind = (typeof AUTH_TOKEN_KINDS)[number];

/** Link monouso inviati per email (conferma indirizzo, nuova password): nel DB solo l'hash. */
export const authToken = pgTable(
	'auth_token',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		kind: text('kind').$type<AuthTokenKind>().notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: createdAt()
	},
	(t) => [index('auth_token_user_idx').on(t.userId, t.kind)]
);

/** Tentativi sbagliati per chiave ("email:…", "ip:…", "reset:…"), in una finestra di tempo. */
export const authAttempt = pgTable('auth_attempt', {
	key: text('key').primaryKey(),
	failures: integer('failures').notNull().default(0),
	windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow()
});

export const pushSubscription = pgTable('push_subscription', {
	endpoint: text('endpoint').primaryKey(),
	userId: userId(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	userAgent: text('user_agent'),
	createdAt: createdAt()
});

/** Impostazioni globali (modelli AI…), come in japan-trip. */
export const appSetting = pgTable('app_setting', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
	updatedAt: updatedAt()
});

// --- Note, checklist e todo ---

export const note = pgTable(
	'note',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		title: text('title').notNull().default(''),
		// documento Tiptap
		content: jsonb('content'),
		// testo piano, per la ricerca e l'anteprima
		text: text('text').notNull().default(''),
		// nota assegnata a un giorno (compare tra le card "Note di oggi")
		day: date('day', { mode: 'string' }),
		tags: text('tags').array().notNull().default([]),
		pinned: boolean('pinned').notNull().default(false),
		// esclusa dall'AI finché l'utente non la consente
		aiAllowed: boolean('ai_allowed').notNull().default(false),
		// occorrenza di una nota ricorrente
		ruleId: text('rule_id').references(() => noteRule.id, { onDelete: 'set null' }),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('note_user_updated_idx').on(t.userId, t.updatedAt.desc()),
		index('note_user_day_idx').on(t.userId, t.day),
		uniqueIndex('note_rule_day_idx').on(t.ruleId, t.day)
	]
);

export type Repeat = string; // 'daily' | 'weekdays' | 'weekly:1,3' | 'monthly:15' (lib/repeat.ts)

export const noteRule = pgTable('note_rule', {
	id: text('id').primaryKey(),
	userId: userId(),
	// nota modello: le copie ne prendono titolo, testo, checklist e consenso AI
	templateNoteId: text('template_note_id').notNull(),
	repeat: text('repeat').$type<Repeat>().notNull(),
	startsOn: date('starts_on', { mode: 'string' }).notNull(),
	endsOn: date('ends_on', { mode: 'string' }),
	remindTime: time('remind_time'),
	createdAt: createdAt()
});

export const CHECKLIST_KINDS = ['day', 'note'] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

/**
 * 'day': la lista del giorno, una per giorno, creata da sola (upsert) e mai dall'utente.
 * 'note': una checklist dentro una nota.
 */
export const checklist = pgTable(
	'checklist',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		kind: text('kind').$type<ChecklistKind>().notNull(),
		day: date('day', { mode: 'string' }),
		noteId: text('note_id').references(() => note.id, { onDelete: 'cascade' }),
		title: text('title'),
		position: listPosition(),
		createdAt: createdAt()
	},
	(t) => [
		uniqueIndex('checklist_user_day_idx')
			.on(t.userId, t.day)
			.where(sql`${t.kind} = 'day'`),
		index('checklist_note_idx').on(t.noteId)
	]
);

export const todoRule = pgTable('todo_rule', {
	id: text('id').primaryKey(),
	userId: userId(),
	text: text('text').notNull(),
	repeat: text('repeat').$type<Repeat>().notNull(),
	startsOn: date('starts_on', { mode: 'string' }).notNull(),
	endsOn: date('ends_on', { mode: 'string' }),
	remindTime: time('remind_time'),
	createdAt: createdAt()
});

export const todo = pgTable(
	'todo',
	{
		id: text('id').primaryKey(),
		checklistId: text('checklist_id')
			.notNull()
			.references(() => checklist.id, { onDelete: 'cascade' }),
		text: text('text').notNull(),
		position: listPosition(),
		doneAt: timestamp('done_at', { withTimezone: true }),
		// occorrenza di un todo ricorrente
		ruleId: text('rule_id').references(() => todoRule.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('todo_checklist_idx').on(t.checklistId, t.position),
		uniqueIndex('todo_rule_checklist_idx').on(t.ruleId, t.checklistId)
	]
);

export const reminder = pgTable(
	'reminder',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		noteId: text('note_id').references(() => note.id, { onDelete: 'cascade' }),
		todoId: text('todo_id').references(() => todo.id, { onDelete: 'cascade' }),
		todoRuleId: text('todo_rule_id').references(() => todoRule.id, { onDelete: 'cascade' }),
		fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
		title: text('title').notNull(),
		body: text('body').notNull().default(''),
		sentAt: timestamp('sent_at', { withTimezone: true }),
		createdAt: createdAt()
	},
	(t) => [
		index('reminder_pending_idx')
			.on(t.fireAt)
			.where(sql`${t.sentAt} is null`)
	]
);

/** Contatore giornaliero delle richieste AI per utente. */
export const aiUsage = pgTable(
	'ai_usage',
	{
		userId: userId(),
		day: date('day', { mode: 'string' }).notNull(),
		requests: integer('requests').notNull().default(0),
		webRequests: integer('web_requests').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.userId, t.day] })]
);
