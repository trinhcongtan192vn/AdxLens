CREATE TABLE "app"."llm_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"key_ciphertext" "bytea" NOT NULL,
	"key_version" integer NOT NULL,
	"key_hint" text NOT NULL,
	"updated_by" uuid NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_keys_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "app"."llm_keys" ADD CONSTRAINT "llm_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;