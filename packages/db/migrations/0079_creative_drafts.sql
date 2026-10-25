CREATE TABLE "app"."creative_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"storage_path" text,
	"content_type" text,
	"prompt" text,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."creative_drafts" ADD CONSTRAINT "creative_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."creative_drafts" ADD CONSTRAINT "creative_drafts_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_drafts_workspace_id_ad_account_id_created_at_index" ON "app"."creative_drafts" USING btree ("workspace_id","ad_account_id","created_at");