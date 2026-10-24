CREATE TABLE "analytics"."entities" (
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"meta_id" text NOT NULL,
	"parent_meta_id" text,
	"name" text,
	"status" text,
	"objective" text,
	"daily_budget" numeric(18, 4),
	"learning_stage" text,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_ad_account_id_entity_type_meta_id_pk" PRIMARY KEY("ad_account_id","entity_type","meta_id")
);
--> statement-breakpoint
CREATE TABLE "analytics"."insights_daily" (
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"meta_id" text NOT NULL,
	"campaign_id" text,
	"adset_id" text,
	"date" date NOT NULL,
	"spend" numeric(18, 4) DEFAULT '0' NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"frequency" numeric(10, 6),
	"clicks" bigint DEFAULT 0 NOT NULL,
	"link_clicks" bigint DEFAULT 0 NOT NULL,
	"results" bigint DEFAULT 0 NOT NULL,
	"result_type" text,
	"conversion_value" numeric(18, 4),
	"attribution_window" text NOT NULL,
	"actions" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_daily_ad_account_id_entity_type_meta_id_date_pk" PRIMARY KEY("ad_account_id","entity_type","meta_id","date")
);
--> statement-breakpoint
CREATE TABLE "app"."sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"batches_total" integer DEFAULT 1 NOT NULL,
	"batches_done" integer DEFAULT 0 NOT NULL,
	"days_done" integer DEFAULT 0 NOT NULL,
	"days_total" integer DEFAULT 0 NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics"."entities" ADD CONSTRAINT "entities_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."insights_daily" ADD CONSTRAINT "insights_daily_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sync_runs" ADD CONSTRAINT "sync_runs_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_workspace_id_index" ON "analytics"."entities" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "insights_daily_ad_account_id_date_index" ON "analytics"."insights_daily" USING btree ("ad_account_id","date");--> statement-breakpoint
CREATE INDEX "insights_daily_workspace_id_index" ON "analytics"."insights_daily" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sync_runs_workspace_id_index" ON "app"."sync_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sync_runs_ad_account_id_created_at_index" ON "app"."sync_runs" USING btree ("ad_account_id","created_at");