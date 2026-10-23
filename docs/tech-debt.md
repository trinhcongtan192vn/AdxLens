# Tech debt

Ghi mọi chỗ làm tạm: vị trí, lý do, cách sửa đúng, mốc dự kiến sửa.

| Ngày | Vị trí | Lý do | Cách sửa đúng | Mốc |
|---|---|---|---|---|
| 2026-10-22 | `apps/web/messages/*.json` → `marketing.privacy`, `marketing.terms`, `marketing.deletion` | Nội dung chính sách là bản giữ chỗ từ Penpot, chưa qua pháp lý (ux-requirements 9) | PM gửi bản pháp lý duyệt, thay chuỗi trong messages | Trước khi nộp Meta App Review |
| 2026-10-23 | D04 nút "Báo số liệu lệch" | Màn X06 Hỗ trợ chưa gán feature (roadmap câu hỏi 6) | Thêm nút khi có X06 | Khi PM chốt X06 |
| 2026-10-23 | D01, D02, D03, O01 (giao diện) | Plugin Penpot bị trình duyệt tạm ngưng khi dựng các màn này; bố cục theo design system và các màn đã đối chiếu, chưa so từng khung | So với khung Penpot D01/D02/D03/O01 khi plugin hoạt động, chỉnh khoảng cách/thứ tự khối | Trước khi PM review cuối |
| 2026-10-23 | `packages/core/billing/stripe.ts` | Checkout tính phí gói cơ bản; **tài khoản vượt hạn mức chưa tính phí thêm** (79.000đ/tài khoản) — hiện xử lý vượt hạn mức bằng ân hạn 7 ngày rồi ngừng đồng bộ | Thêm line item số lượng theo tài khoản vượt (Stripe quantity / PayOS kỳ sau) khi PM chốt cách tính | Khi PM chốt |
| 2026-10-23 | ST03 thông tin xuất hóa đơn | Chỉ lưu thông tin; chưa phát hành hóa đơn VAT điện tử | Nối dịch vụ hóa đơn điện tử VN khi PM chọn nhà cung cấp | Khi PM chốt |
| 2026-10-23 | `packages/core/billing/payos.ts` → `applyPaidOrder` | Đổi gói giữa kỳ qua PayOS: gói mới áp ngay, kỳ mới cộng từ ngày hết kỳ cũ — **chưa tính chênh lệch (proration)** | Tính tiền phần còn lại của kỳ cũ khi PM chốt chính sách đổi gói | Khi PM chốt |
| 2026-10-23 | M06 `/break-even` | Plugin Penpot bị tạm ngưng khi làm M06; mặc định 6 giờ/tài khoản/tháng và 150.000đ/giờ là giả định (PRD chỉ ghi công thức) | So khung Penpot M06; PM chốt số mặc định (theo kết quả E3) và sửa `BREAK_EVEN_DEFAULTS` | Trước khi PM review cuối |
| 2026-10-23 | `apps/web/src/lib/actions.ts` → `ZERO_DECIMAL` | Hiển thị ngân sách Meta (đơn vị nhỏ nhất) dùng danh sách tiền tệ không có phần lẻ viết tay (VND, JPY, KRW, CLP, ISK, PYG) | Đọc offset tiền tệ từ Meta (`/act_x?fields=currency` + bảng offset chính thức) khi có tài khoản dùng tiền tệ khác | Khi có khách dùng tiền tệ ngoài danh sách |
