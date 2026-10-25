CREATE TABLE "app"."recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"week" date NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"finding_id" uuid,
	"entity_type" text NOT NULL,
	"meta_id" text NOT NULL,
	"entity_name" text,
	"action" jsonb NOT NULL,
	"why" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"impact_estimate" numeric(18, 4),
	"confidence" numeric(4, 3) NOT NULL,
	"effort_minutes" integer NOT NULL,
	"score" numeric(14, 6) NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"skip_reason" text,
	"assignee_id" uuid,
	"status_changed_by" uuid,
	"status_changed_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendations_workspace_id_week_ad_account_id_source_source_key_meta_id_unique" UNIQUE("workspace_id","week","ad_account_id","source","source_key","meta_id")
);
--> statement-breakpoint
ALTER TABLE "app"."recommendations" ADD CONSTRAINT "recommendations_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."recommendations" ADD CONSTRAINT "recommendations_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "app"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendations_workspace_id_week_index" ON "app"."recommendations" USING btree ("workspace_id","week");--> statement-breakpoint
CREATE INDEX "recommendations_workspace_id_assignee_id_index" ON "app"."recommendations" USING btree ("workspace_id","assignee_id");