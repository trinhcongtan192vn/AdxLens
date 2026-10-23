# Runbook: số liệu lệch > 1% so với Ads Manager

**Khi nào:** thông báo / email "Số liệu lệch", sự cố `reconciliation_warning` ở AD03, D04 hiện ngày lệch, báo cáo bị khóa chia sẻ.

## 1. Hệ thống đã làm gì
- Báo cáo của Client có ngày lệch **bị chặn chia sẻ / PDF / gửi theo lịch** (ADR-0007) — khách không thấy số lệch.
- Playbook `reconcile_retry`: đồng bộ lại khoảng ngày lệch và đối chiếu lại sau 24 giờ (1 lần/ngày/tài khoản). Khớp lại → sự cố tự đóng.

## 2. Xác định phạm vi
- D04 `/clients/<id>/reconciliation`: ngày nào, chi tiêu / kết quả nội bộ vs Meta, % lệch.
- `pnpm e4:report -- --workspace <uuid> --days 30`: báo cáo độ lệch + mức phủ dữ liệu theo tài khoản (local/staging).
- Nguyên nhân thường gặp: Meta cập nhật trễ số liệu ngày gần (thường tự khớp sau 24–72 giờ); thay đổi cửa sổ attribution; tài khoản đổi múi giờ; lỗi đồng bộ một lô.

## 3. Khôi phục
- Chờ lần chạy lại tự động; hoặc người dùng bấm "Đồng bộ lại" ở D04 / S06.
- Vẫn lệch sau lần chạy lại → leo thang: mở issue `agent-diagnose` với fingerprint `reconcile:<account>` (không dán số liệu khách).

## 4. Không làm
- **Không nới ngưỡng 1%** hay sửa định nghĩa chỉ số (CLAUDE.md quy tắc 4 — cần task + ADR).
- Không mở khóa chia sẻ bằng tay trong DB.
