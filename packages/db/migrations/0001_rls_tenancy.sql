-- RLS: lớp phòng thủ thứ hai cho cách ly workspace (L3 5.3). API và worker kết nối bằng role chủ
-- bảng và luôn lọc workspace_id ở tầng ứng dụng; role `authenticated`/`anon` không được cấp quyền
-- trực tiếp trên schema app/analytics. Mọi bảng mới phải gọi app.enable_workspace_rls()
-- (test packages/db/src/rls.test.ts kiểm tra mọi bảng đều bật RLS).

create or replace function app.enable_workspace_rls(tbl regclass) returns void
language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('drop policy if exists workspace_isolation on %s', tbl);
  execute format(
    'create policy workspace_isolation on %s to authenticated '
    'using (workspace_id = nullif(auth.jwt() ->> ''workspace_id'', '''')::uuid) '
    'with check (workspace_id = nullif(auth.jwt() ->> ''workspace_id'', '''')::uuid)',
    tbl
  );
end;
$$;
--> statement-breakpoint
-- workspaces: khóa là id, không phải workspace_id.
alter table app.workspaces enable row level security;
--> statement-breakpoint
create policy workspace_isolation on app.workspaces to authenticated
  using (id = nullif(auth.jwt() ->> 'workspace_id', '')::uuid);
--> statement-breakpoint
select app.enable_workspace_rls('app.memberships');
--> statement-breakpoint
select app.enable_workspace_rls('app.clients');
--> statement-breakpoint
select app.enable_workspace_rls('app.invitations');
--> statement-breakpoint
select app.enable_workspace_rls('app.audit_events');
--> statement-breakpoint
-- users: chỉ đọc chính mình.
alter table app.users enable row level security;
--> statement-breakpoint
create policy self_only on app.users to authenticated
  using (id = nullif(auth.jwt() ->> 'sub', '')::uuid);
--> statement-breakpoint
-- staff: không có policy; chỉ role chủ bảng (service) đọc.
alter table app.staff enable row level security;
