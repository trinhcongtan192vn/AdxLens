# Tech debt

Ghi mọi chỗ làm tạm: vị trí, lý do, cách sửa đúng, mốc dự kiến sửa.

| Ngày | Vị trí | Lý do | Cách sửa đúng | Mốc |
|---|---|---|---|---|
| 2026-10-22 | `apps/web/messages/*.json` → `marketing.privacy`, `marketing.terms`, `marketing.deletion` | Nội dung chính sách là bản giữ chỗ từ Penpot, chưa qua pháp lý (ux-requirements 9) | PM gửi bản pháp lý duyệt, thay chuỗi trong messages | Trước khi nộp Meta App Review |
| 2026-10-22 | `apps/web/src/app/(marketing)/page.tsx` nút "Xem báo cáo mẫu" → `/r/demo` | Trang báo cáo công khai và dữ liệu mẫu chưa có | Feature 021 (trang công khai) + 025 (tài khoản mẫu) phục vụ `/r/demo` | 025 |
| 2026-10-23 | `packages/core/src/billing/plans.ts` → `currentPlanKey()` | Chưa có bảng subscription, mọi workspace trả gói Free (S04 hiện hạn mức theo gói này) | Đọc gói từ bảng subscription | 026 |
| 2026-10-23 | D04 nút "Báo số liệu lệch" | Màn X06 Hỗ trợ chưa gán feature (roadmap câu hỏi 6) | Thêm nút khi có X06 | Khi PM chốt X06 |
| 2026-10-23 | `packages/core/reconciliation` khi lệch | Người phụ trách đã nhận thông báo + email (023) và share link bị khóa (021); **đội AdxLens** chưa có kênh cảnh báo riêng (L3 6.4 Slack/email nội bộ) — hiện chỉ có sự cố P2 | Gửi sự cố P1/P2 tới kênh nội bộ khi có trang Sự cố (AD03) | 043 |
| 2026-10-23 | D01, D02, D03, O01 (giao diện) | Plugin Penpot bị trình duyệt tạm ngưng khi dựng các màn này; bố cục theo design system và các màn đã đối chiếu, chưa so từng khung | So với khung Penpot D01/D02/D03/O01 khi plugin hoạt động, chỉnh khoảng cách/thứ tự khối | Trước khi PM review cuối |
