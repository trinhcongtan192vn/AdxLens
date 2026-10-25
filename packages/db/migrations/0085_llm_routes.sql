CREATE TABLE "app"."llm_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."llm_keys" DROP CONSTRAINT "llm_keys_workspace_id_unique";--> statement-breakpoint
ALTER TABLE "app"."llm_routes" ADD CONSTRAINT "llm_routes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_routes_workspace_task_uq" ON "app"."llm_routes" USING btree ("workspace_id","task");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_keys_workspace_provider_uq" ON "app"."llm_keys" USING btree ("workspace_id","provider");