CREATE TABLE "app"."billing_plans" (
	"key" text PRIMARY KEY NOT NULL,
	"monthly_price_vnd" numeric(14, 0) NOT NULL,
	"monthly_price_usd" numeric(10, 2),
	"included_accounts" integer NOT NULL,
	"extra_account_vnd" numeric(14, 0) DEFAULT '0' NOT NULL,
	"entitlements" text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."subscriptions" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"plan_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"provider" text DEFAULT 'none' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"past_due_since" timestamp with time zone,
	"over_limit_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;