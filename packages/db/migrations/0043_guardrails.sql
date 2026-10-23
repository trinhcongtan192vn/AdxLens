CREATE TABLE "app"."guardrail_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"max_budget_change_pct" numeric(5, 2) NOT NULL,
	"max_actions_per_day" integer NOT NULL,
	"min_data_days" integer NOT NULL,
	"quiet_start_hour" integer NOT NULL,
	"quiet_end_hour" integer NOT NULL,
	"breaker_failures" integer NOT NULL,
	"exclude_meta_ids" text[] NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."guardrail_settings" ADD CONSTRAINT "guardrail_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;