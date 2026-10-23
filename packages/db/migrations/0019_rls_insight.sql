-- RLS theo workspace (L3 5.3). rule_configs: dòng mặc định (workspace_id null) không hiện với authenticated.
select app.enable_workspace_rls('app.findings');
--> statement-breakpoint
select app.enable_workspace_rls('app.finding_feedback');
--> statement-breakpoint
select app.enable_workspace_rls('app.rule_configs');
