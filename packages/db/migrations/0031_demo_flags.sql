ALTER TABLE "app"."clients" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."meta_connections" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;