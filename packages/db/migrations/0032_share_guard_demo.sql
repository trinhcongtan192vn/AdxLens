-- Dữ liệu mẫu (S01, PRD P0-02) không chia sẻ được: thêm điều kiện vào trigger chặn share link (ADR-0007).
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
  if exists (
    select 1 from app.ad_accounts a join app.meta_connections c on c.id = a.connection_id
    where a.workspace_id = new.workspace_id and a.client_id = r.client_id and c.is_demo
  ) then
    raise exception 'REPORT_BLOCKED: demo data' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
