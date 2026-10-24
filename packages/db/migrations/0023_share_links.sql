CREATE TABLE "app"."share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"token" text NOT NULL,
	"password_hash" text,
	"show_badge" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "app"."share_links" ADD CONSTRAINT "share_links_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "app"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_links_workspace_id_index" ON "app"."share_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "share_links_report_id_index" ON "app"."share_links" USING btree ("report_id");