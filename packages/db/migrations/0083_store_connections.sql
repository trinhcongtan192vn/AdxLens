CREATE TABLE "app"."store_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text,
	"timezone" text,
	"token_ciphertext" "bytea",
	"token_key_version" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_connections_workspace_id_provider_external_id_unique" UNIQUE("workspace_id","provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "analytics"."store_daily" (
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"date" date NOT NULL,
	"orders" integer,
	"revenue" numeric(18, 4),
	"sessions" integer,
	"conversions" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_daily_connection_id_date_pk" PRIMARY KEY("connection_id","date")
);
--> statement-breakpoint
ALTER TABLE "app"."store_connections" ADD CONSTRAINT "store_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."store_connections" ADD CONSTRAINT "store_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."store_daily" ADD CONSTRAINT "store_daily_connection_id_store_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_connections_workspace_id_client_id_index" ON "app"."store_connections" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "store_daily_workspace_id_index" ON "analytics"."store_daily" USING btree ("workspace_id");