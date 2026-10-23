-- Dữ liệu vận hành, không thuộc workspace: RLS bật, không policy cho người dùng.
alter table app.ops_execution_checks enable row level security;
