CREATE TABLE "app"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"locale" text NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"content" jsonb,
	"edits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary_text" text,
	"reconciliation_status" text,
	"integrity" jsonb,
	"template_version" text NOT NULL,
	"pdf_path" text,
	"error" text,
	"created_by" uuid NOT NULL,
	"built_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_workspace_id_index" ON "app"."reports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "reports_client_id_created_at_index" ON "app"."reports" USING btree ("client_id","created_at");