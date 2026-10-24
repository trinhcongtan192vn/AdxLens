CREATE TABLE "app"."ops_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"ad_account_id" uuid,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"source" text NOT NULL,
	"fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"issue_ref" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ops_playbook_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid,
	"workspace_id" uuid,
	"playbook" text NOT NULL,
	"scope_key" text NOT NULL,
	"result" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."ops_playbook_runs" ADD CONSTRAINT "ops_playbook_runs_incident_id_ops_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "app"."ops_incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_incidents_status_severity_index" ON "app"."ops_incidents" USING btree ("status","severity");--> statement-breakpoint
CREATE INDEX "ops_incidents_fingerprint_index" ON "app"."ops_incidents" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "ops_incidents_workspace_id_index" ON "app"."ops_incidents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ops_playbook_runs_playbook_scope_key_at_index" ON "app"."ops_playbook_runs" USING btree ("playbook","scope_key","at");