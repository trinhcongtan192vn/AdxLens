# Tech debt

Ghi mọi chỗ làm tạm: vị trí, lý do, cách sửa đúng, mốc dự kiến sửa.

| Ngày | Vị trí | Lý do | Cách sửa đúng | Mốc |
|---|---|---|---|---|
| 2026-10-22 | `apps/web/messages/*.json` → `marketing.privacy`, `marketing.terms`, `marketing.deletion` | Nội dung chính sách là bản giữ chỗ từ Penpot, chưa qua pháp lý (ux-requirements 9) | PM gửi bản pháp lý duyệt, thay chuỗi trong messages | Trước khi nộp Meta App Review |
| 2026-10-22 | `apps/web/src/app/(marketing)/page.tsx` nút "Xem báo cáo mẫu" → `/r/demo` | Trang báo cáo công khai và dữ liệu mẫu chưa có | Feature 021 (trang công khai) + 025 (tài khoản mẫu) phục vụ `/r/demo` | 025 |
| 2026-10-22 | `apps/web/src/server/deletion-status.ts` | Bảng yêu cầu xóa dữ liệu chưa có, mọi mã trả "không tìm thấy" | Feature 014 lưu yêu cầu xóa và mã xác nhận, tra theo mã | 014 |
| 2026-10-22 | `apps/web/src/server/route.ts` | Chưa giới hạn 600 request/phút/workspace (L3 10.1) | Thêm rate limit Redis (INCR + EXPIRE theo workspace) trong `route()`, header `X-RateLimit-Remaining` | 009 |
