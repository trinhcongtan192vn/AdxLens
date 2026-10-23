-- RLS: subscriptions theo workspace; billing_plans là cấu hình toàn hệ thống (RLS bật, không policy).
select app.enable_workspace_rls('app.subscriptions');
--> statement-breakpoint
alter table app.billing_plans enable row level security;
--> statement-breakpoint
-- Giá tạm theo ux-requirements 9.1 (chờ chốt sau E3, PRD 13.3). PM chỉnh trực tiếp bảng này.
insert into app.billing_plans (key, monthly_price_vnd, monthly_price_usd, included_accounts, extra_account_vnd, entitlements, sort_order) values
  ('free', 0, 0, 1, 0, array['reports'], 0),
  ('starter', 590000, 24, 5, 79000, array['reports','recommendations','detailed_reconciliation'], 1),
  ('growth', 1490000, 59, 15, 79000, array['reports','recommendations','detailed_reconciliation','write_actions','automation'], 2),
  ('scale', 3490000, 139, 40, 79000, array['reports','recommendations','detailed_reconciliation','write_actions','automation','remove_badge','white_label','priority_support'], 3)
on conflict (key) do nothing;
