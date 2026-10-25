CREATE TABLE "app"."report_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"period" text NOT NULL,
	"report_id" uuid,
	"status" text NOT NULL,
	"reason" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_deliveries_schedule_id_period_unique" UNIQUE("schedule_id","period")
);
--> statement-breakpoint
CREATE TABLE "app"."report_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"cadence" text NOT NULL,
	"weekday" smallint,
	"month_day" smallint,
	"send_hour" smallint NOT NULL,
	"timezone" text NOT NULL,
	"mode" text NOT NULL,
	"delivery" text NOT NULL,
	"locale" text,
	"recipients" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."report_deliveries" ADD CONSTRAINT "report_deliveries_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "app"."report_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."report_deliveries" ADD CONSTRAINT "report_deliveries_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "app"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."report_schedules" ADD CONSTRAINT "report_schedules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "app"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_deliveries_workspace_id_index" ON "app"."report_deliveries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "report_schedules_workspace_id_index" ON "app"."report_schedules" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "report_schedules_client_id_index" ON "app"."report_schedules" USING btree ("client_id");