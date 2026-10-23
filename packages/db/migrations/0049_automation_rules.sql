CREATE TABLE "app"."automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_key" text,
	"level" text NOT NULL,
	"condition" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"guardrails" jsonb NOT NULL,
	"mode" text DEFAULT 'shadow' NOT NULL,
	"shadow_started_at" timestamp with time zone,
	"live_since" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."rule_evaluations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"as_of_date" text NOT NULL,
	"matched_entities" jsonb NOT NULL,
	"would_do" jsonb NOT NULL,
	"action_ids" uuid[],
	"blocked_by_guardrail" text
);
--> statement-breakpoint
ALTER TABLE "app"."automation_rules" ADD CONSTRAINT "automation_rules_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rule_evaluations" ADD CONSTRAINT "rule_evaluations_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "app"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rules_workspace_id_index" ON "app"."automation_rules" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "automation_rules_mode_index" ON "app"."automation_rules" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "rule_evaluations_rule_id_evaluated_at_index" ON "app"."rule_evaluations" USING btree ("rule_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "rule_evaluations_workspace_id_index" ON "app"."rule_evaluations" USING btree ("workspace_id");