ALTER TABLE "app"."workspaces" ADD COLUMN "default_currency" text DEFAULT 'VND' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."workspaces" ADD COLUMN "report_from_email" text;