CREATE TABLE "app"."scheduled_reverts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_id" uuid,
	"action_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text,
	"result_action_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."scheduled_reverts" ADD CONSTRAINT "scheduled_reverts_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "app"."automation_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."scheduled_reverts" ADD CONSTRAINT "scheduled_reverts_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "app"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_reverts_status_due_at_index" ON "app"."scheduled_reverts" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "scheduled_reverts_workspace_id_index" ON "app"."scheduled_reverts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_reverts_action_id_kind_index" ON "app"."scheduled_reverts" USING btree ("action_id","kind");