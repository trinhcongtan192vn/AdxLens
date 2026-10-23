-- RLS theo workspace (L3 5.3).
select app.enable_workspace_rls('app.notifications');
--> statement-breakpoint
select app.enable_workspace_rls('app.notification_settings');
