# ADR-0005: Backfill bắt đầu khi nhập tài khoản (S04), không chờ xác nhận gán

- Trạng thái: Đã chấp nhận (PM chọn 23/10/2026)
- Ngày: 23/10/2026

## Bối cảnh
PRD mục pipeline ("backfill 90 ngày khi kết nối") và Penpot S05 ("Bạn vẫn xem được số liệu, nhưng chưa thể chia sẻ báo cáo") cho thấy số liệu có trước khi xác nhận gán Client. L2 (sơ đồ F1, bảng job) và L3 7.3 lại ghi backfill chạy sau khi xác nhận gán. Hai nguồn mâu thuẫn; PM được hỏi.

## Quyết định
- `POST /ad-accounts/import` (S04) bắt đầu backfill 90 ngày cho từng tài khoản vừa nhập (`startBackfill`, idempotent).
- Xác nhận gán Client không kích hoạt đồng bộ; nó chỉ là điều kiện để chia sẻ/gửi báo cáo của Client đó (BR01, P0-14, P0-24).
- Backfill: 90 ngày tới hôm qua theo múi giờ ad account, lô 7 ngày, lô mới nhất chạy trước để có kết quả một phần sớm.
- L2 và L3 7.3 đã sửa cho khớp.

## Hệ quả
- Người dùng thấy tiến độ đồng bộ (S06) ngay sau S05, kể cả khi còn dòng chưa xác nhận.
- Tài khoản nhập nhưng không bao giờ gán vẫn tiêu tốn lượt gọi Meta; chấp nhận vì S04 đã giới hạn theo gói.
