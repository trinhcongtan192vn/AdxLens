# ADR-0028: Link Business Dashboard công khai cho khách

- Trạng thái: **Chấp nhận** (PM 25/10/2026, gap "Link Business công khai" sau khi đối chiếu Madgicx Academy)
- Liên quan: ADR-0007 (chia sẻ báo cáo chỉ khi toàn vẹn), P0-14 / P0-22 / P0-23 (link công khai, khóa khi lệch, khi ngắt
  kết nối)
- Vùng bảo vệ: `packages/db` (bảng `business_links`, migration 0081–0082)

## Quyết định

**1. Phạm vi.** Link theo **một Client**: các tài khoản QC đã xác nhận của Client.
- Kỳ cố định 7 hoặc 30 ngày tới **hôm qua** (múi giờ tài khoản), so với kỳ trước.
- Số liệu sống, đọc snapshot mỗi lần mở; số do code tính, không LLM.

**2. Khóa giống báo cáo.** Trang công khai hiện "đang cập nhật" (không hiện số) khi trong kỳ có:
- tài khoản chưa xác nhận Client;
- ngày đối chiếu lệch > 1%;
- kết nối đã ngắt;
- dữ liệu mẫu.

Lý do: giữ cam kết "khớp Ads Manager". Khi lý do khóa hết, trang tự mở lại.

**3. Bảo mật** (như link báo cáo):
- token 32 byte ngẫu nhiên;
- mật khẩu tùy chọn (scrypt) + cookie ký 12 giờ cho đúng link;
- hạn 7 / 30 / 90 ngày hoặc không hết hạn;
- thu hồi ngay; không index;
- đếm lượt xem; badge "Powered by" theo gói.

**4. Quyền.** Tạo / thu hồi cần `reports.manage` và quyền xem Client đó.

**5. Đường dẫn.** `/b/<token>` (công khai, cùng lớp với `/r/`). Tra token là truy vấn xuyên workspace có chủ đích ở
`core/ops`; mọi xử lý sau đó chạy trong workspace của link.

## Rủi ro
- Lộ số liệu khi link bị chuyển tiếp: có mật khẩu, hạn, thu hồi; trang không index.
