-- meta_connections: bật RLS, KHÔNG có policy cho authenticated (L3 5.3): chỉ service role đọc token.
alter table app.meta_connections enable row level security;
--> statement-breakpoint
select app.enable_workspace_rls('app.meta_available_accounts');
--> statement-breakpoint
select app.enable_workspace_rls('app.ad_accounts');
--> statement-breakpoint
select app.enable_workspace_rls('app.job_audit');
