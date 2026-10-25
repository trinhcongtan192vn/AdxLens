CREATE TABLE "app"."oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."oauth_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"scopes" text[] DEFAULT '{"read"}' NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_hash" text,
	"code_challenge" text NOT NULL,
	"code_expires_at" timestamp with time zone,
	"access_hash" text,
	"access_expires_at" timestamp with time zone,
	"refresh_hash" text,
	"refresh_expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_grants_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "oauth_grants_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "oauth_grants_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
ALTER TABLE "app"."oauth_grants" ADD CONSTRAINT "oauth_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."oauth_grants" ADD CONSTRAINT "oauth_grants_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_grants_workspace_id_user_id_index" ON "app"."oauth_grants" USING btree ("workspace_id","user_id");