-- ADR-0013: staff PM hiện có → superadmin; vai trò chỉ nhận giá trị hợp lệ.
update app.staff set role = 'superadmin' where can_enable_flags;
--> statement-breakpoint
alter table app.staff add constraint staff_role_check check (role in ('superadmin', 'operator'));
--> statement-breakpoint
-- Đề xuất bật cờ thuộc workspace; chỉ server (core/flags) đọc/ghi.
select app.enable_workspace_rls('app.flag_proposals');
--> statement-breakpoint
-- Nhật ký admin: dữ liệu vận hành, không policy cho người dùng; chỉ thêm (chặn UPDATE / DELETE).
alter table app.admin_audit_log enable row level security;
--> statement-breakpoint
create or replace function app.admin_audit_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_log là append-only';
end $$;
--> statement-breakpoint
create trigger admin_audit_log_no_change before update or delete on app.admin_audit_log
  for each row execute function app.admin_audit_log_append_only();
