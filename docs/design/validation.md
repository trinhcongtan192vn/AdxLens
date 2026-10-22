# AdxLens — Bước 6 Validation (Gate 4)

Phạm vi đã kiểm: độ tương phản WCAG của token (tính bằng công thức), rà 10 màn trong Penpot theo nguyên tắc design system. Chưa kiểm: bàn phím/focus order, màn hình đọc, responsive ngoài A10, kiểm thử với người dùng thật.

## 1. Tương phản (WCAG 2.2 AA: chữ 4,5:1; thành phần UI/đồ họa 3:1)

| Cặp màu | Tỷ lệ | Kết quả | Xử lý |
|---|---|---|---|
| text/primary · secondary · tertiary trên surface | 17,9 · 7,6 · 4,8 | Đạt | — |
| text/tertiary trên bg/subtle (header bảng) | 4,34 | **Trượt** | **Đã sửa:** header bảng dùng text/secondary (6,9), áp cho component và các bảng trong 10 màn |
| text/tertiary trên canvas | 4,55 | Đạt sát ngưỡng | Không dùng cho chữ nhỏ quan trọng |
| text/disabled | 2,56 | Miễn (control vô hiệu) | — |
| Link, brand trên selected, on-primary (cả hover) | 5,6–7,9 | Đạt | — |
| Badge Subtle: success/warning/danger/info | 4,8–6,2 | Đạt | — |
| Delta dương green/600 trên trắng | 3,30 | **Trượt** | **Đã sửa:** token `color.delta.positive` → green/700 (5,02). Trên hàng đang chọn còn 4,49, sát ngưỡng |
| Delta âm red/600 | 4,83 | Đạt | — |
| Badge Solid: chữ trắng trên green/700, amber/700 (thực tế trong thiết kế) | 5,02 · 5,02 | Đạt | **Không cần sửa:** kiểm lại, component đã dùng green/700 và amber/700 (5,02); bảng tính ban đầu giả định nhầm 600 |
| Badge Solid danger, info | 4,83 · 5,17 | Đạt | — |
| Viền control (input/select/checkbox) border/strong | 1,48 | **Trượt** (UI 3:1) | Viền control cần ≥ 3:1: đề xuất token `border/control` = #8A99AD (2,9, gần) hoặc gray/500 (4,76). **Đã chọn gray/500** (4,76): thêm token `color.border.control`, áp cho Input, Select, Checkbox ở trạng thái mặc định; viền Error đổi sang red/600 |
| Viền card border/default | 1,23 | Chấp nhận | Viền trang trí, ranh giới đã rõ nhờ nền; không mang thông tin |
| border/focus indigo/500 | 4,47 | Đạt | — |
| Màu biểu đồ trên trắng | sky 2,77 · green 2,54 · amber 2,15 | **Trượt** (3:1) | **Đã sửa token:** chart/2 #0284C7 (4,10), chart/3 #059669 (3,77), chart/4 #D97706 (3,19). Chart/5 hồng 3,53 và chart/6 tím 4,23 đạt |

Quy tắc đã có và giữ: delta luôn kèm mũi tên và dấu, trạng thái luôn kèm chữ; biểu đồ nhiều series phải có nhãn trực tiếp hoặc legend, không chỉ dựa vào màu.

## 2. Rà 10 màn

| Kiểm tra | Kết quả |
|---|---|
| Cỡ chữ tối thiểu 11px | Đạt cả 10 màn |
| Sidebar 9 mục có icon và nhãn | Đạt A01–A08 |
| Dòng nguồn "Khớp Meta · cập nhật · attribution · tiền tệ · múi giờ" | Có ở A01, A02, A03, A04, A07, A10. **Thiếu ở A05, A06**. **Đã thêm.** Hai màn này hiện số liệu trước/sau thao tác. A08, A09 không hiện số liệu quảng cáo nên không cần |
| Màn P1/P2 báo cờ tắt | **Đã thêm** màn A11 "Cờ tắt": sidebar ẩn 4 mục P1/P2, vùng nội dung báo "Tính năng chưa được bật cho workspace này" (CLAUDE.md điều 7). Một màn dùng chung cho cả A04–A06 |
| Chặn gửi khi lệch > 1% | A03 hiển thị đúng: nút "Gửi cho khách" vô hiệu, banner "Chạy lại đồng bộ" |
| Chuỗi giao diện | Toàn bộ là tiếng Việt cứng trong thiết kế. Khi code phải đưa qua i18n (vi, en); độ dài bản en cần kiểm lại ở sidebar 184px và cột bảng |
| Lớp phủ drawer A02/A04 | A02 có scrim; A04 đã thêm scrim |

## 3. Giới hạn của thiết kế hiện tại
- Nav item trên các màn là bản đã tách khỏi component, sửa component gốc sẽ không lan sang.
- Logo agency ở A03, A10 là hình giữ chỗ.
- Dark và Regular chỉ có trong tài liệu token, chưa có bản dựng.
- 48 màn còn lại trong danh mục 58 màn chưa thiết kế.

## 4. Trạng thái Gate 4
PM đã duyệt cả 3 đề xuất; đã áp dụng. Còn mở: Nav item đã tách khỏi component, logo agency giữ chỗ, chưa kiểm bàn phím/màn hình đọc/bản tiếng Anh. Bước tiếp theo: bước 7 Handoff.
