-- ADR-0014: kiểu khớp điều kiện chỉ nhận 'all' (VÀ) hoặc 'any' (HOẶC).
alter table app.automation_rules add constraint automation_rules_match_check check (match in ('all', 'any'));
