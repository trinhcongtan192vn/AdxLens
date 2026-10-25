-- RLS theo workspace cho bảng đồng bộ (L3 5.3).
select app.enable_workspace_rls('analytics.entities');
--> statement-breakpoint
select app.enable_workspace_rls('analytics.insights_daily');
--> statement-breakpoint
select app.enable_workspace_rls('app.sync_runs');
