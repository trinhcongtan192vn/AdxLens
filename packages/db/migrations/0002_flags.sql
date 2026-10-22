CREATE TABLE "app"."feature_flags" (
	"workspace_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_by" uuid,
	"enabled_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "feature_flags_workspace_id_flag_key_pk" PRIMARY KEY("workspace_id","flag_key")
);
--> statement-breakpoint
CREATE TABLE "app"."flag_change_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"old_value" boolean NOT NULL,
	"new_value" boolean NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"checklist_result" jsonb NOT NULL,
	"override" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."feature_flags" ADD CONSTRAINT "feature_flags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flag_change_log_workspace_id_flag_key_index" ON "app"."flag_change_log" USING btree ("workspace_id","flag_key");