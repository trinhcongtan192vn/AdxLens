-- AI router (ADR-0030): bật RLS theo workspace cho bảng định tuyến (như các bảng nghiệp vụ khác).
select app.enable_workspace_rls('app.llm_routes');
