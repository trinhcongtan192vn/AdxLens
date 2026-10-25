-- RLS cho cờ tính năng (L3 18.1). flag_change_log là append-only: chặn update/delete ở mức DB.
select app.enable_workspace_rls('app.feature_flags');
--> statement-breakpoint
select app.enable_workspace_rls('app.flag_change_log');
--> statement-breakpoint
create or replace function app.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Bảng % chỉ cho phép thêm (append-only)', tg_table_name;
end;
$$;
--> statement-breakpoint
create trigger flag_change_log_append_only
  before update or delete on app.flag_change_log
  for each row execute function app.forbid_mutation();
