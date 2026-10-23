CREATE TABLE "app"."ops_execution_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_version" text NOT NULL,
	"app_env" text NOT NULL,
	"passed" boolean NOT NULL,
	"steps" jsonb NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ops_execution_checks_app_version_ran_at_index" ON "app"."ops_execution_checks" USING btree ("app_version","ran_at");