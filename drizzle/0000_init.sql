CREATE TABLE "ai_usage" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"web_requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_attempt" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "checklist" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"day" date,
	"note_id" text,
	"title" text,
	"position" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000000)::bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" jsonb,
	"text" text DEFAULT '' NOT NULL,
	"day" date,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"ai_allowed" boolean DEFAULT false NOT NULL,
	"rule_id" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"template_note_id" text NOT NULL,
	"repeat" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"remind_time" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"note_id" text,
	"todo_id" text,
	"todo_rule_id" text,
	"fire_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_agent" text,
	"remember" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" text PRIMARY KEY NOT NULL,
	"checklist_id" text NOT NULL,
	"text" text NOT NULL,
	"position" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000000)::bigint NOT NULL,
	"done_at" timestamp with time zone,
	"rule_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"repeat" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"remind_time" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"google_sub" text,
	"timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"ai_default_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist" ADD CONSTRAINT "checklist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist" ADD CONSTRAINT "checklist_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_rule_id_note_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."note_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_rule" ADD CONSTRAINT "note_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_todo_rule_id_todo_rule_id_fk" FOREIGN KEY ("todo_rule_id") REFERENCES "public"."todo_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_rule_id_todo_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."todo_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_rule" ADD CONSTRAINT "todo_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_token_user_idx" ON "auth_token" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_user_day_idx" ON "checklist" USING btree ("user_id","day") WHERE "checklist"."kind" = 'day';--> statement-breakpoint
CREATE INDEX "checklist_note_idx" ON "checklist" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_user_updated_idx" ON "note" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "note_user_day_idx" ON "note" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "note_rule_day_idx" ON "note" USING btree ("rule_id","day");--> statement-breakpoint
CREATE INDEX "reminder_pending_idx" ON "reminder" USING btree ("fire_at") WHERE "reminder"."sent_at" is null;--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "todo_checklist_idx" ON "todo" USING btree ("checklist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "todo_rule_checklist_idx" ON "todo" USING btree ("rule_id","checklist_id");