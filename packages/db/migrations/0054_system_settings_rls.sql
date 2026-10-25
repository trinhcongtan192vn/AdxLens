-- Cấu hình vận hành toàn hệ thống (ADR-0013): không thuộc workspace, RLS bật, không policy cho người dùng.
alter table app.system_settings enable row level security;
