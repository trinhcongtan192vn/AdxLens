-- Khóa API MCP (ADR-0020): theo workspace; hash không bao giờ trả ra.
select app.enable_workspace_rls('app.api_keys');
