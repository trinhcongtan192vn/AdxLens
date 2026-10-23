CREATE TABLE "app"."finding_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"rule_group" text NOT NULL,
	"entity_type" text NOT NULL,
	"meta_id" text NOT NULL,
	"entity_name" text,
	"severity" text NOT NULL,
	"impact_estimate" numeric(18, 4),
	"impact_method" text,
	"evidence" jsonb NOT NULL,
	"explanation" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"dismiss_reason" text,
	"snapshot_version" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "findings_ad_account_id_rule_id_entity_type_meta_id_unique" UNIQUE("ad_account_id","rule_id","entity_type","meta_id")
);
--> statement-breakpoint
CREATE TABLE "app"."rule_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"rule_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_configs_rule_id_workspace_id_unique" UNIQUE NULLS NOT DISTINCT("rule_id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "app"."finding_feedback" ADD CONSTRAINT "finding_feedback_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "app"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."findings" ADD CONSTRAINT "findings_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_feedback_workspace_id_index" ON "app"."finding_feedback" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "finding_feedback_finding_id_index" ON "app"."finding_feedback" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "findings_workspace_id_index" ON "app"."findings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "findings_ad_account_id_status_index" ON "app"."findings" USING btree ("ad_account_id","status");