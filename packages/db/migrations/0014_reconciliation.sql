CREATE TABLE "app"."reconciliation_results" (
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"spend_internal" numeric(18, 4) NOT NULL,
	"spend_meta" numeric(18, 4) NOT NULL,
	"results_internal" bigint NOT NULL,
	"results_meta" bigint NOT NULL,
	"impressions_internal" bigint DEFAULT 0 NOT NULL,
	"impressions_meta" bigint DEFAULT 0 NOT NULL,
	"link_clicks_internal" bigint DEFAULT 0 NOT NULL,
	"link_clicks_meta" bigint DEFAULT 0 NOT NULL,
	"conversion_value_internal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"conversion_value_meta" numeric(18, 4) DEFAULT '0' NOT NULL,
	"result_types" text[] DEFAULT '{}' NOT NULL,
	"results_by_type" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spend_delta_pct" numeric(10, 6) NOT NULL,
	"results_delta_pct" numeric(10, 6) NOT NULL,
	"status" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_results_ad_account_id_date_pk" PRIMARY KEY("ad_account_id","date")
);
--> statement-breakpoint
ALTER TABLE "app"."reconciliation_results" ADD CONSTRAINT "reconciliation_results_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_results_workspace_id_index" ON "app"."reconciliation_results" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "reconciliation_results_ad_account_id_status_index" ON "app"."reconciliation_results" USING btree ("ad_account_id","status");