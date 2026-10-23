# ADR-0013: Vai trò staff (superadmin / operator), đề xuất bật cờ, nhật ký thao tác admin

- Trạng thái: Đề xuất (chờ PM duyệt cùng PR develop → main)
- Ngày: 2026-10-23
- Liên quan: L3 18.2 (staff), ADR-0008 (kill switch), CLAUDE.md quy tắc 1, 6, 7, 9

## Bối cảnh
Trang `/admin` (AD01–AD04) có một loại staff với cờ `can_enable_flags` ("PM"). PM yêu cầu (23/10/2026) trang admin
đủ cho vận hành thật, với hai vai trò: **superadmin** và **operator**. Operator được đề xuất bật cờ, superadmin duyệt.

## Quyết định
1. `app.staff.role` ∈ {`superadmin`, `operator`} (mặc định `operator`). Migration: staff có `can_enable_flags = true`
   → `superadmin`. `can_enable_flags` giữ làm cột dẫn xuất (luôn = `role = 'superadmin'`, ghi cùng lúc) để không đổi
   `core/flags`; xóa cột ở task sau (tech-debt).
2. Quyền:

   | Thao tác | superadmin | operator |
   |---|---|---|
   | Quản lý staff (thêm theo email người dùng đã có, đổi vai trò, gỡ) | ✅ | ❌ |
   | Bật cờ (checklist + lý do, qua `core/flags`) | ✅ | ❌ — gửi **đề xuất** |
   | Duyệt / từ chối đề xuất bật cờ | ✅ | ❌ (hủy đề xuất của mình) |
   | Tắt cờ | ✅ | ✅ (an toàn: tắt dây chuyền) |
   | Kill switch toàn cục: bật | ✅ | ✅ (dừng khẩn cấp) |
   | Kill switch toàn cục: tắt | ✅ | ❌ |
   | Sửa gói / giá, tặng gói, gia hạn ân hạn | ✅ | ❌ |
   | Xem, chạy lại đồng bộ, retry job, đóng breaker | ✅ | ✅ |

   Không được còn 0 superadmin (không gỡ / hạ vai trò superadmin cuối cùng; không tự hạ vai trò mình).
3. **Đề xuất bật cờ** (`app.flag_proposals`, trong `core/flags`): operator tạo (workspace, cờ, lý do); superadmin
   duyệt → gọi `enableFlag` (vẫn chạy checklist; vượt checklist cần superadmin chọn và được ghi log như cũ). Đường bật
   cờ duy nhất vẫn là `core/flags` (quy tắc 7).
4. **Nhật ký thao tác admin** (`app.admin_audit_log`, append-only bằng trigger): mọi thao tác ghi từ trang admin
   (staff, đề xuất, kill switch, chạy lại đồng bộ, retry job, đóng breaker, gói / giá, thông báo bảo trì…): ai, khi
   nào, hành động, đối tượng, workspace (nếu có), lý do, chi tiết. Không ghi token, body request hay dữ liệu quảng cáo.
5. Truy vấn xuyên workspace của trang admin chỉ ở `packages/core/ops`, có ghi chú lý do; route `auth: 'staff'` được
   khai báo trong bộ test cách ly (exempt có lý do + test riêng chặn người không phải staff).

## Không làm
- Không sửa guardrails mặc định, ngưỡng đối chiếu 1%, ngưỡng rule audit từ admin (chỉ xem).
- Không hiện / xuất token Meta.
- Không "đăng nhập thay khách".

## Hệ quả
- Thêm 2 bảng + 1 cột (`packages/db`, vùng bảo vệ) và chạm `core/flags` (vùng bảo vệ): PM duyệt.
- Staff cũ không phải PM → operator, PM → superadmin: không ai mất quyền đang có.
