# Runbook: PM bật / tắt cờ tính năng

Cờ theo workspace: Báo cáo (`p0_reports`), Gợi ý (`p1_recommendations`), Duyệt 1 click (`p2a_approve`), Tự động hóa (`p2b_auto`). Chỉ đổi qua `/admin/flags` (AD01/AD02, `packages/core/flags`); không có đường khác (CLAUDE.md quy tắc 7).

## Bật
1. `/admin/flags` → tìm workspace → bấm ô cờ → hộp thoại AD02 chạy checklist kỹ thuật tự động:
   - **Báo cáo:** mọi tài khoản đã xác nhận gán Client; đối chiếu 7 ngày khớp; không có sự cố P1 đang mở.
   - **Gợi ý:** Báo cáo đã bật ≥ 14 ngày; tỷ lệ phát hiện bị đánh dấu "sai" ≤ 20%.
   - **Duyệt 1 click:** có kết nối được cấp quyền ghi; `pnpm execution:check` của **bản deploy hiện tại** đạt trên staging; kill switch toàn cục tắt; Owner đã lưu guardrails. Gói Growth trở lên (kiểm ở gateway).
   - **Tự động hóa:** Duyệt 1 click ≥ 8 tuần, hoàn tác ≤ 5%, 0 sự cố P1 thực thi; rule phải chạy thử ≥ 14 ngày (kiểm ở rule).
2. Checklist chưa đạt → chỉ bật được bằng "Vượt checklist" + lý do (ghi log, hiện ở lịch sử cờ).
3. Cờ phụ thuộc: P1 cần P0; P2a cần P1; P2b cần P2a.

## Tắt
- Tắt một cờ tắt luôn cờ phụ thuộc; dữ liệu giữ nguyên. Tắt Duyệt 1 click / Tự động hóa **hủy mọi hành động đang chờ** (`auto` khi tắt Tự động hóa).
- Sự cố thực thi: ưu tiên kill switch (tức thì, không đổi cờ) — xem execution-incident.md.
