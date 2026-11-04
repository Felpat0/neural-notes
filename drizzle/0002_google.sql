CREATE TABLE "google_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"expires_at" timestamp with time zone,
	"target_calendar_id" text,
	"read_calendar_ids" text[] DEFAULT '{}' NOT NULL,
	"push_todos" boolean DEFAULT true NOT NULL,
	"push_untimed_todos" boolean DEFAULT false NOT NULL,
	"push_notes" boolean DEFAULT true NOT NULL,
	"pull_changes" boolean DEFAULT true NOT NULL,
	"pulled_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar" (
	"user_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"color" text,
	"channel_id" text,
	"channel_resource_id" text,
	"channel_expires_at" timestamp with time zone,
	CONSTRAINT "google_calendar_user_id_calendar_id_pk" PRIMARY KEY("user_id","calendar_id")
);
--> statement-breakpoint
CREATE TABLE "google_event" (
	"user_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"event_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"location" text,
	"html_link" text,
	"start" timestamp with time zone,
	"end" timestamp with time zone,
	"start_day" date,
	"end_day" date,
	CONSTRAINT "google_event_user_id_calendar_id_event_id_pk" PRIMARY KEY("user_id","calendar_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "google_event_link" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"event_id" text NOT NULL,
	"etag" text,
	"hash" text,
	"detached_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_event_link_kind_entity_id_pk" PRIMARY KEY("kind","entity_id")
);
--> statement-breakpoint
CREATE TABLE "google_outbox" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_outbox_kind_entity_id_pk" PRIMARY KEY("kind","entity_id")
);
--> statement-breakpoint
ALTER TABLE "google_account" ADD CONSTRAINT "google_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar" ADD CONSTRAINT "google_calendar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_event" ADD CONSTRAINT "google_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_event_link" ADD CONSTRAINT "google_event_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_outbox" ADD CONSTRAINT "google_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_channel_idx" ON "google_calendar" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "google_event_start_idx" ON "google_event" USING btree ("user_id","start");--> statement-breakpoint
CREATE INDEX "google_event_day_idx" ON "google_event" USING btree ("user_id","start_day");--> statement-breakpoint
CREATE INDEX "google_event_link_event_idx" ON "google_event_link" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "google_outbox_user_idx" ON "google_outbox" USING btree ("user_id");