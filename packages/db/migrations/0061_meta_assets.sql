CREATE TABLE "app"."meta_assets" (
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_assets_connection_id_kind_meta_id_unique" UNIQUE("connection_id","kind","meta_id")
);
--> statement-breakpoint
ALTER TABLE "app"."meta_assets" ADD CONSTRAINT "meta_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."meta_assets" ADD CONSTRAINT "meta_assets_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_assets_workspace_id_kind_index" ON "app"."meta_assets" USING btree ("workspace_id","kind");