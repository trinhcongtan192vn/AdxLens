-- Ngân sách tháng theo Client (A3): bảng theo workspace.
select app.enable_workspace_rls('app.client_budgets');
--> statement-breakpoint
alter table app.client_budgets add constraint client_budgets_month_check check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
--> statement-breakpoint
alter table app.client_budgets add constraint client_budgets_amount_check check (amount > 0);
