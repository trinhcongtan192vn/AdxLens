CREATE TABLE "app"."ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"client_id" uuid,
	"suggested_client_name" text,
	"meta_account_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"assignment_status" text DEFAULT 'suggested' NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"active_30d" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_accounts_workspace_id_meta_account_id_unique" UNIQUE("workspace_id","meta_account_id")
);
--> statement-breakpoint
CREATE TABLE "app"."job_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"job_id" text,
	"endpoint" text NOT NULL,
	"meta_account_id" text,
	"duration_ms" integer NOT NULL,
	"status" integer NOT NULL,
	"error_code" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."meta_available_accounts" (
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"meta_account_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"account_status" integer,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_available_accounts_connection_id_meta_account_id_unique" UNIQUE("connection_id","meta_account_id")
);
--> statement-breakpoint
CREATE TABLE "app"."meta_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"meta_user_id" text NOT NULL,
	"meta_user_name" text,
	"token_ciphertext" "bytea" NOT NULL,
	"token_key_version" integer NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."ad_accounts" ADD CONSTRAINT "ad_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ad_accounts" ADD CONSTRAINT "ad_accounts_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ad_accounts" ADD CONSTRAINT "ad_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."meta_available_accounts" ADD CONSTRAINT "meta_available_accounts_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "app"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."meta_connections" ADD CONSTRAINT "meta_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_accounts_workspace_id_client_id_index" ON "app"."ad_accounts" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "job_audit_at_index" ON "app"."job_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "job_audit_workspace_id_at_index" ON "app"."job_audit" USING btree ("workspace_id","at");--> statement-breakpoint
CREATE INDEX "meta_available_accounts_workspace_id_index" ON "app"."meta_available_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "meta_connections_workspace_id_index" ON "app"."meta_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "meta_connections_meta_user_id_index" ON "app"."meta_connections" USING btree ("meta_user_id");