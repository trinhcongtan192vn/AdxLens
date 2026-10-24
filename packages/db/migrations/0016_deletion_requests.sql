CREATE TABLE "app"."deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"code" text NOT NULL,
	"source" text NOT NULL,
	"meta_user_id" text NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deletion_requests_workspace_id_index" ON "app"."deletion_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "deletion_requests_connection_id_index" ON "app"."deletion_requests" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "deletion_requests_code_index" ON "app"."deletion_requests" USING btree ("code");