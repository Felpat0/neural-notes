CREATE TABLE "google_import" (
	"user_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"event_id" text NOT NULL,
	"todo_id" text NOT NULL,
	"title" text NOT NULL,
	"day" date NOT NULL,
	"time" text,
	CONSTRAINT "google_import_user_id_calendar_id_event_id_pk" PRIMARY KEY("user_id","calendar_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "google_import" ADD CONSTRAINT "google_import_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_import_todo_idx" ON "google_import" USING btree ("todo_id");