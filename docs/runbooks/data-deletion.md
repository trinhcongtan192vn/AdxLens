# Runbook: yêu cầu xóa dữ liệu

**Khi nào:** Meta gửi callback xóa dữ liệu / deauthorize (`POST /api/v1/webhooks/meta`), người dùng ngắt kết nối (S07), khách hỏi trạng thái xóa (`/data-deletion?code=…`).

## 1. Hệ thống làm gì
- Ngắt kết nối: token xóa **ngay**, kết nối `revoked`; job `maintenance:purge_connection_data` xóa dữ liệu quảng cáo của các tài khoản liên quan sau 7 ngày (cho phép hoàn tác nhầm lẫn), trong hạn cam kết 30 ngày (ADR-0001 A8).
- Callback Meta: thu hồi mọi kết nối của `meta_user_id`, trả `confirmation_code`; trang `/data-deletion` cho tra trạng thái.

## 2. Kiểm tra
- `app.deletion_requests`: trạng thái theo mã. Kết nối đã thu hồi không còn token (ciphertext đã xóa).
- Job purge lỗi → sự cố ở AD03; chạy lại job: `pnpm job:trigger -- maintenance:purge_connection_data '{"workspaceId":"…","connectionId":"…"}'` (local / staging).

## 3. Không làm
- Không khôi phục token đã xóa; không trì hoãn purge quá 30 ngày.
