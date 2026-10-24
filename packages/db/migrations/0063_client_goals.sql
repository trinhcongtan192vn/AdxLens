CREATE TABLE "app"."client_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"primary_metric" text,
	"primary_target" numeric(18, 4),
	"currency" text,
	"secondary_metrics" text[] DEFAULT '{}' NOT NULL,
	"industry" text,
	"sub_industry" text,
	"default_page_id" text,
	"default_instagram_id" text,
	"default_pixel_id" text,
	"onboarded_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_goals_workspace_id_client_id_unique" UNIQUE("workspace_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "app"."client_goals" ADD CONSTRAINT "client_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."client_goals" ADD CONSTRAINT "client_goals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_goals_workspace_id_index" ON "app"."client_goals" USING btree ("workspace_id");