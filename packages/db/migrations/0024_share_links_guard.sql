-- RLS theo workspace (L3 5.3).
select app.enable_workspace_rls('app.share_links');
--> statement-breakpoint
-- Lớp chặn thứ hai ở DB (ADR-0007, BR01, PRD P0-14): không tạo được share link khi Client của báo cáo có
-- tài khoản QC chưa xác nhận gán, hoặc có ngày đối chiếu lệch (> 1%) trong kỳ báo cáo, hoặc kết nối Meta
-- của tài khoản đã bị ngắt (P0-22). API kiểm trước và trả 422; trigger này chặn mọi đường ghi khác.
create or replace function app.guard_share_link() returns trigger
language plpgsql as $$
declare
  r record;
begin
  select rp.client_id, rp.date_from, rp.date_to, rp.workspace_id, rp.status
    into r from app.reports rp where rp.id = new.report_id;
  if r is null or r.workspace_id <> new.workspace_id then
    raise exception 'REPORT_BLOCKED: report not found in workspace' using errcode = 'P0001';
  end if;
  if r.status <> 'ready' then
    raise exception 'REPORT_BLOCKED: report not ready' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from app.ad_accounts a
    where a.workspace_id = new.workspace_id and a.client_id = r.client_id and a.assignment_status <> 'confirmed'
  ) then
    raise exception 'REPORT_BLOCKED: unconfirmed assignment' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from app.reconciliation_results rr
    join app.ad_accounts a on a.id = rr.ad_account_id
    where a.workspace_id = new.workspace_id and a.client_id = r.client_id
      and rr.status = 'warning' and rr.date between r.date_from and r.date_to
  ) then
    raise exception 'REPORT_BLOCKED: reconciliation warning' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from app.ad_accounts a join app.meta_connections c on c.id = a.connection_id
    where a.workspace_id = new.workspace_id and a.client_id = r.client_id and c.status = 'revoked'
  ) then
    raise exception 'REPORT_BLOCKED: connection revoked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
drop trigger if exists share_links_guard on app.share_links;
--> statement-breakpoint
create trigger share_links_guard before insert on app.share_links
  for each row execute function app.guard_share_link();
