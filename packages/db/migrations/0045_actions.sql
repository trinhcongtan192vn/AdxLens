CREATE TABLE "app"."action_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"event" text NOT NULL,
	"detail" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"recommendation_id" uuid,
	"rule_id" uuid,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_meta_id" text NOT NULL,
	"target_name" text,
	"tier" text NOT NULL,
	"params" jsonb NOT NULL,
	"before_state" jsonb NOT NULL,
	"after_expected" jsonb NOT NULL,
	"after_state" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_code" text,
	"error_message" text,
	"idempotency_key" text NOT NULL,
	"requested_by" uuid,
	"approved_by" uuid,
	"undo_of" uuid,
	"executed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."circuit_breakers" (
	"ad_account_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"open" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."kill_switches" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"active" boolean DEFAULT false NOT NULL,
	"reason" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."action_logs" ADD CONSTRAINT "action_logs_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "app"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."actions" ADD CONSTRAINT "actions_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."actions" ADD CONSTRAINT "actions_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "app"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."actions" ADD CONSTRAINT "actions_undo_of_actions_id_fk" FOREIGN KEY ("undo_of") REFERENCES "app"."actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."circuit_breakers" ADD CONSTRAINT "circuit_breakers_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "app"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kill_switches" ADD CONSTRAINT "kill_switches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_logs_action_id_index" ON "app"."action_logs" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "action_logs_workspace_id_index" ON "app"."action_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_idempotency_key_uq" ON "app"."actions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "actions_workspace_id_created_at_index" ON "app"."actions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "actions_ad_account_id_created_at_index" ON "app"."actions" USING btree ("ad_account_id","created_at");