-- ADR-0029: kết nối cửa hàng / analytics và số liệu ngày — theo workspace.
select app.enable_workspace_rls('app.store_connections');
--> statement-breakpoint
select app.enable_workspace_rls('analytics.store_daily');
