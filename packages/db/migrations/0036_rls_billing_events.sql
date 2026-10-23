-- RLS cho bảng thanh toán 027 (server dùng service role; policy chặn truy cập trực tiếp ngoài workspace).
select app.enable_workspace_rls('app.billing_profiles');
select app.enable_workspace_rls('app.billing_events');
