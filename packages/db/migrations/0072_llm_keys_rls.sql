-- Khóa LLM tự mang (ADR-0022): bật RLS, KHÔNG có policy cho authenticated (như meta_connections): chỉ service role đọc.
alter table app.llm_keys enable row level security;
