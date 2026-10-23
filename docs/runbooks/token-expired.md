# Runbook: token Meta sắp / đã hết hạn

**Khi nào:** thông báo / email E06 "Token sắp hết hạn", banner X04 "Token Meta … đã hết hạn", S02 hiện "Hết hạn".

## 1. Hệ thống đã làm gì
- `maintenance:daily_tick` (09:00 giờ VN), playbook `token_expiring`: token còn ≤ 7 ngày → email người kết nối (1 lần/ngày); đã hết hạn → kết nối `expired`, đồng bộ của các tài khoản liên quan dừng, banner hiện cho cả workspace.

## 2. Khôi phục
- Người có quyền (Owner / manager) vào **Kết nối → Kết nối lại** (OAuth Meta). Token mới được mã hóa và lưu, tài khoản đánh dấu chờ đồng bộ lại; daily sync kế tiếp bù dữ liệu.
- Kết nối có quyền ghi: sau khi kết nối lại chỉ với quyền đọc, quyền ghi tạm mất (gateway kiểm scope) → Owner vào "Quyền ghi" cấp lại.

## 3. Không làm
- Không xin token qua email / chat, không dán token vào issue hay log (CLAUDE.md quy tắc 2).
