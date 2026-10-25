# Runbook: sự cố thực thi trên Meta (P2)

**Khi nào:** sự cố `execution_failed` (AD03 / thông báo "Hành động trên Meta thất bại"), circuit breaker mở, khách báo AdxLens thay đổi sai.

## 1. Dừng trước, tìm hiểu sau
- Một workspace: Owner vào **Cài đặt → Guardrails → Bật kill switch** (cần lý do). Hủy ngay mọi hành động đang chờ.
- Toàn hệ thống: PM vào **/admin/kill-switch → Bật toàn cục**.
- Giao diện không dùng được: `pnpm killswitch -- on --reason "<lý do>"` (toàn cục) hoặc `pnpm killswitch -- on --workspace <id> --reason "<lý do>"`. Chạy ở môi trường đã được cấp quyền; CLI ghi audit.

## 2. Xác định phạm vi
- **Nhật ký hành động** (`/action-log`) của workspace: lọc "Thất bại". Mở chi tiết: dòng thời gian cho biết lỗi ở bước đọc trước, gửi tới Meta hay xác minh.
- Mã kết quả:
  - `verify_mismatch`: Meta trả trạng thái khác mong đợi.
  - `state_changed`: đối tượng bị đổi trên Meta sau khi duyệt (không ghi đè).
  - `meta_error`: Meta từ chối.
  - `meta_error_check_manually`: nhân bản lỗi; kiểm tra trên Ads Manager xem bản sao có được tạo không.
  - `applied_despite_error`: thành công dù Meta báo lỗi (đã xác minh).
- Circuit breaker mở = N lỗi liên tiếp trên một tài khoản; hành động đang chờ của tài khoản đó đã bị hủy.

## 3. Khôi phục
- Hành động sai nhưng đã thành công → **Hoàn tác** ở trang chi tiết (đi qua đúng gateway). Nhân bản không hoàn tác tự động: tạm dừng / xóa bản sao trên Ads Manager.
- Sau khi xử lý nguyên nhân: Owner **Mở khóa** tài khoản ở Guardrails (đóng breaker), tắt kill switch.
- Nghi lỗi code: chạy `pnpm execution:check -- <ad_id> <adset_id>` trên staging với tài khoản test trước khi mở lại.

## 4. Không làm
- Không tự chạy lại hành động ghi bằng tay ngoài giao diện duyệt; không nới guardrails để "cho qua"; không bật lại cờ cho workspace khác khi sự cố chưa đóng (CLAUDE.md quy tắc 6, 7).
