# ADR-0007: Báo cáo — cho tạo nháp, chặn chia sẻ/gửi khi chưa toàn vẹn

- Trạng thái: Đã chấp nhận (PM chọn 23/10/2026)
- Ngày: 23/10/2026

## Bối cảnh
L3 10.2 (`POST /reports`) trả 422 `REPORT_BLOCKED` khi Client có tài khoản chưa xác nhận gán hoặc đối chiếu lệch. PRD P0-14/P0-24, L2 mục 6 và Penpot S05 ("vẫn xem được số liệu, nhưng chưa thể chia sẻ báo cáo") chỉ chặn chia sẻ và gửi.

## Quyết định
- Tạo báo cáo (bản nháp, chỉ người trong agency xem) luôn được phép; báo cáo ghi lại trạng thái toàn vẹn lúc dựng (`integrity`: tài khoản chưa xác nhận, ngày lệch > 1% trong kỳ) và `reconciliation_status`.
- Chặn ở mọi đường ra cho khách: tạo share link (021, cả API và trigger DB), xuất PDF gửi khách (022), lịch gửi (024 — hoãn và báo account manager). Kiểm tra lại toàn vẹn **tại thời điểm chia sẻ/gửi**, không chỉ dùng giá trị lúc dựng.
- R03 hiển thị banner trạng thái bị khóa chia sẻ kèm lý do.
- L3 10.2 sửa: `POST /reports` không trả 422 vì toàn vẹn; `POST /reports/{id}/share-links` trả 422 `REPORT_BLOCKED`.

## Hệ quả
- Agency xem trước được để xử lý (xác nhận gán, chạy lại đối chiếu) mà khách không bao giờ thấy số lệch.
