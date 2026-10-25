CREATE TABLE "app"."flag_global" (
	"flag_key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "app"."flag_scope_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"plan_key" text,
	"flag_key" text NOT NULL,
	"old_value" boolean NOT NULL,
	"new_value" boolean NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."plan_flags" (
	"plan_key" text NOT NULL,
	"flag_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone,
	CONSTRAINT "plan_flags_plan_key_flag_key_pk" PRIMARY KEY("plan_key","flag_key")
);
--> statement-breakpoint
CREATE INDEX "flag_scope_log_at_index" ON "app"."flag_scope_log" USING btree ("at");