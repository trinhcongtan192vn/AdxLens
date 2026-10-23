CREATE TABLE "analytics"."insights_breakdowns" (
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"adset_id" text NOT NULL,
	"date" date NOT NULL,
	"breakdown" text NOT NULL,
	"key" text NOT NULL,
	"spend" numeric(18, 4) DEFAULT '0' NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"link_clicks" bigint DEFAULT 0 NOT NULL,
	"results" bigint DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_breakdowns_ad_account_id_adset_id_date_breakdown_key_pk" PRIMARY KEY("ad_account_id","adset_id","date","breakdown","key")
);
--> statement-breakpoint
ALTER TABLE "analytics"."insights_breakdowns" ADD CONSTRAINT "insights_breakdowns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insights_breakdowns_ad_account_id_breakdown_date_index" ON "analytics"."insights_breakdowns" USING btree ("ad_account_id","breakdown","date");--> statement-breakpoint
CREATE INDEX "insights_breakdowns_workspace_id_index" ON "analytics"."insights_breakdowns" USING btree ("workspace_id");