-- OAuth MCP (ADR-0022 B). oauth_clients không thuộc workspace (ứng dụng): bật RLS, không policy cho người dùng.
alter table app.oauth_clients enable row level security;
--> statement-breakpoint
select app.enable_workspace_rls('app.oauth_grants');
