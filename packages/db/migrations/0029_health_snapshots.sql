CREATE TABLE "app"."health_snapshots" (
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"week" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_snapshots_ad_account_id_week_pk" PRIMARY KEY("ad_account_id","week")
);
--> statement-breakpoint
ALTER TABLE "app"."health_snapshots" ADD CONSTRAINT "health_snapshots_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_snapshots_workspace_id_index" ON "app"."health_snapshots" USING btree ("workspace_id");