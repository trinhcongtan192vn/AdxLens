CREATE TABLE "app"."agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."agent_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."agent_messages" ADD CONSTRAINT "agent_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agent_messages" ADD CONSTRAINT "agent_messages_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "app"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agent_threads" ADD CONSTRAINT "agent_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_workspace_id_thread_id_created_at_index" ON "app"."agent_messages" USING btree ("workspace_id","thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_workspace_id_user_id_created_at_index" ON "app"."agent_messages" USING btree ("workspace_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_threads_workspace_id_user_id_updated_at_index" ON "app"."agent_threads" USING btree ("workspace_id","user_id","updated_at");