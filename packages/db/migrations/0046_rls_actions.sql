-- RLS bảng thực thi (035). kill_switches có dòng 'global' không thuộc workspace: RLS bật, không policy cho
-- người dùng (chỉ server đọc/ghi qua core/execution).
select app.enable_workspace_rls('app.actions');
select app.enable_workspace_rls('app.action_logs');
select app.enable_workspace_rls('app.circuit_breakers');
alter table app.kill_switches enable row level security;
--> statement-breakpoint
-- Nhật ký hành động chỉ thêm (ADR-0008 mục 5): chặn UPDATE. DELETE chỉ xảy ra theo cascade khi xóa workspace.
create or replace function app.action_logs_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'action_logs là append-only';
end $$;
--> statement-breakpoint
create trigger action_logs_no_update before update on app.action_logs
  for each row execute function app.action_logs_append_only();
