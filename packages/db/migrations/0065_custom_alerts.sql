CREATE TABLE "app"."custom_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid,
	"currency" text,
	"metric" text NOT NULL,
	"condition" text NOT NULL,
	"threshold" numeric(18, 4) NOT NULL,
	"window" text DEFAULT '1d' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"last_fired_on" date,
	"last_value" numeric(18, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."custom_alerts" ADD CONSTRAINT "custom_alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."custom_alerts" ADD CONSTRAINT "custom_alerts_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_alerts_workspace_id_index" ON "app"."custom_alerts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "custom_alerts_workspace_id_ad_account_id_index" ON "app"."custom_alerts" USING btree ("workspace_id","ad_account_id");