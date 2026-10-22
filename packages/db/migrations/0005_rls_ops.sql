-- Sự cố vận hành: workspace_id có thể null (sự cố toàn hệ thống). Role authenticated chỉ thấy sự cố
-- gắn với workspace của mình; sự cố toàn hệ thống chỉ module ops (role chủ bảng) đọc.
select app.enable_workspace_rls('app.ops_incidents');
--> statement-breakpoint
select app.enable_workspace_rls('app.ops_playbook_runs');
