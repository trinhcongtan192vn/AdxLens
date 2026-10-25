CREATE TABLE "app"."client_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" text NOT NULL,
	"alert_status" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_budgets_client_id_month_unique" UNIQUE("client_id","month")
);
--> statement-breakpoint
ALTER TABLE "app"."client_budgets" ADD CONSTRAINT "client_budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."client_budgets" ADD CONSTRAINT "client_budgets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_budgets_workspace_id_month_index" ON "app"."client_budgets" USING btree ("workspace_id","month");