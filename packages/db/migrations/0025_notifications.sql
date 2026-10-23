CREATE TABLE "app"."notification_settings" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"in_app" boolean NOT NULL,
	"email" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_workspace_id_user_id_kind_pk" PRIMARY KEY("workspace_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "app"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"email_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_workspace_id_user_id_dedupe_key_unique" UNIQUE("workspace_id","user_id","dedupe_key")
);
--> statement-breakpoint
CREATE INDEX "notifications_workspace_id_user_id_created_at_index" ON "app"."notifications" USING btree ("workspace_id","user_id","created_at");