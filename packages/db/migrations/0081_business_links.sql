CREATE TABLE "app"."business_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"token" text NOT NULL,
	"period_days" smallint NOT NULL,
	"password_hash" text,
	"show_badge" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "app"."business_links" ADD CONSTRAINT "business_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_links" ADD CONSTRAINT "business_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_links_workspace_id_client_id_index" ON "app"."business_links" USING btree ("workspace_id","client_id");