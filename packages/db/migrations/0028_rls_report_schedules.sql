-- RLS theo workspace (L3 5.3).
select app.enable_workspace_rls('app.report_schedules');
--> statement-breakpoint
select app.enable_workspace_rls('app.report_deliveries');
