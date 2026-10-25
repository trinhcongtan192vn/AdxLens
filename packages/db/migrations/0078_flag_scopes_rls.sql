-- ADR-0024: cờ toàn app, ma trận gói, nhật ký — không thuộc workspace: bật RLS, không policy cho người dùng.
alter table app.flag_global enable row level security;
--> statement-breakpoint
alter table app.plan_flags enable row level security;
--> statement-breakpoint
alter table app.flag_scope_log enable row level security;
--> statement-breakpoint
-- ADR-0024 (PM 25/10/2026): kết nối đã có quyền ads_management = đồng ý cho AdxLens thao tác tài khoản → bật ghi mặc định.
-- Owner vẫn tắt được ở Kết nối → Quyền ghi.
update app.meta_connections
set write_enabled = true, write_changed_at = now()
where write_enabled = false and write_changed_at is null and 'ads_management' = any(scopes);
--> statement-breakpoint
-- Cờ theo workspace thành NGOẠI LỆ: dòng `enabled = true` (bật trong giai đoạn thử nghiệm) giữ làm "bật thêm" để không ai
-- mất tính năng; dòng `enabled = false` chỉ là "đã tắt" theo mô hình cũ → xóa để về theo toàn app × gói.
delete from app.feature_flags where enabled = false;
