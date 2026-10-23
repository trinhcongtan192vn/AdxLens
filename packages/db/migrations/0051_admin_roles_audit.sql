CREATE TABLE "app"."flag_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"proposed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"workspace_id" uuid,
	"reason" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."staff" ADD COLUMN "role" text DEFAULT 'operator' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."flag_proposals" ADD CONSTRAINT "flag_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flag_proposals_status_created_at_index" ON "app"."flag_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "flag_proposals_workspace_id_index" ON "app"."flag_proposals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_at_index" ON "app"."admin_audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_user_id_at_index" ON "app"."admin_audit_log" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_workspace_id_index" ON "app"."admin_audit_log" USING btree ("workspace_id");