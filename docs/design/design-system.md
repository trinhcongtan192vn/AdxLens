# AdxLens — Design System v0.1 (Gate 2 draft)

> Trạng thái: **tài liệu nền tảng đã xong; file Figma chưa dựng** (gói Starter đã hết hạn mức gọi MCP, xem mục 9).
> Figma file: https://www.figma.com/design/kWhT11s2BUQyi67y4nSd7n (đang trống)

## 1. Nguyên tắc
1. **Mật độ trước tiên (U1).** Bảng nén, số dùng tabular-nums, header sticky; không dùng thẻ số lớn đơn lẻ. Ít khoảng trống.
2. **Bảng là trung tâm.** Kế thừa mô hình tư duy của Ads Manager; tile KPI chỉ ở dạng nhỏ gọn.
3. **Viền thay bóng.** Phân tầng bằng border và nền, bóng chỉ cho tooltip/dialog/drawer.
4. **Màu mang nghĩa.** Xanh lá/đỏ chỉ dùng cho delta và trạng thái; thương hiệu dùng indigo.
5. **Bằng chứng luôn hiện.** Mỗi khối số liệu có dòng nguồn: "Khớp Meta · cập nhật … · cửa sổ attribution · tiền tệ · múi giờ".
6. **Phát hành một chế độ.** Chỉ Light + Compact; token Dark/Regular được định nghĩa cho code nhưng chưa phát hành UI.

## 2. Nghiên cứu đối thủ → quyết định
| Đối thủ | Quan sát | Quyết định cho AdxLens |
|---|---|---|
| Triple Whale | Tile tóm tắt, ghim chỉ số, tile mở ra bảng, so sánh kỳ trước | Tile tối giản + luôn có so sánh kỳ trước |
| Madgicx One-Click Report | Widget (line/area/bar/pie/table/informer/goal), template kéo thả, link công khai, PDF; không có gửi định kỳ, không white-label | Giữ link công khai + PDF, thêm white-label và lịch gửi |
| Bïrch | Rule builder AND/OR, nhóm explorer, nhật ký tự động | Rule builder dạng hàng, nhật ký dạng bảng |

## 3. Màu
### 3.1 Primitives (ẩn khỏi picker, scopes = [])
- **gray (slate):** 50 #F8FAFC · 100 #F1F5F9 · 200 #E2E8F0 · 300 #CBD5E1 · 400 #94A3B8 · 500 #64748B · 600 #475569 · 700 #334155 · 800 #1E293B · 900 #0F172A
- **indigo:** 50 #EEF2FF · 100 #E0E7FF · 500 #6366F1 · 600 #4F46E5 · 700 #4338CA
- **green:** 50 #F0FDF4 · 200 #BBF7D0 · 600 #16A34A · 700 #15803D
- **red:** 50 #FEF2F2 · 200 #FECACA · 600 #DC2626 · 700 #B91C1C
- **amber:** 50 #FFFBEB · 200 #FDE68A · 600 #D97706 · 700 #B45309
- **blue:** 50 #EFF6FF · 200 #BFDBFE · 600 #2563EB · 700 #1D4ED8
- **chart 1–6:** #4F46E5 · #0EA5E9 · #10B981 · #F59E0B · #EC4899 · #8B5CF6
- white #FFFFFF, black #000000

### 3.2 Semantic (Light / Dark cho code)
| Token | Light | Dark (chỉ code) |
|---|---|---|
| bg/canvas | gray/50 | gray/900 |
| bg/surface | white | gray/800 |
| bg/subtle | gray/100 | gray/700 |
| bg/hover | gray/50 | gray/700 |
| bg/selected | indigo/50 | indigo/700 @ 25% |
| bg/inverse | gray/900 | gray/50 |
| text/primary | gray/900 | gray/50 |
| text/secondary | gray/600 | gray/300 |
| text/tertiary | gray/500 | gray/400 |
| text/disabled | gray/400 | gray/500 |
| text/inverse | white | gray/900 |
| text/link | indigo/600 | indigo/500 |
| border/default | gray/200 | gray/700 |
| border/subtle | gray/100 | gray/800 |
| border/strong | gray/300 | gray/600 |
| border/focus | indigo/500 | indigo/500 |
| brand/primary | indigo/600 | indigo/500 |
| brand/primary-hover | indigo/700 | indigo/600 |
| brand/primary-subtle | indigo/50 | indigo/700 @ 25% |
| brand/on-primary | white | white |
| status/{success,warning,danger,info}-fg | *-700 | *-200 |
| status/…-bg | *-50 | *-600 @ 15% |
| status/…-border | *-200 | *-600 @ 40% |
| delta/positive | green/600 | green/500 (green/200 cho chữ nhỏ) |
| delta/negative | red/600 | red/200 cho chữ nhỏ |
| chart/1–6 | như primitives | tăng sáng 1 bậc |

Tên CSS: `--color-<nhóm>-<tên>` (ví dụ `--color-bg-surface`).

## 4. Khoảng cách, bo góc, mật độ
- **Spacing:** 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48 (`--space-N`).
- **Radius:** none 0 · xs 2 · sm 4 · md 6 · lg 8 · full 999.
- **Density (Compact phát hành / Regular chỉ cho code):**

| Token | Compact | Regular |
|---|---|---|
| control-height | 28 | 32 |
| row-height | 32 | 40 |
| cell-x | 8 | 12 |
| cell-y | 6 | 10 |

## 5. Typography (Inter)
| Style | Cỡ/dòng | Độ đậm | Dùng cho |
|---|---|---|---|
| Display | 24/32 | Semi Bold | tiêu đề trang báo cáo công khai |
| H1 | 20/28 | Semi Bold | tiêu đề trang |
| H2 | 16/24 | Semi Bold | tiêu đề khối |
| H3 | 14/20 | Semi Bold | tiêu đề phụ |
| Body | 13/20 | Regular | nội dung mặc định |
| Body Strong | 13/20 | Medium | nhấn mạnh |
| Small | 12/16 | Regular | chú thích |
| Caption | 11/16 | Medium | nhãn nhỏ |
| Overline | 11/16 | Semi Bold, HOA | nhãn nhóm |
| KPI number | 22/28 | Semi Bold | số KPI |
| Table number | 13/20 | Regular | số trong bảng, căn phải |

Code: bật `font-variant-numeric: tabular-nums` cho mọi số; số căn phải trong bảng.

## 6. Hiệu ứng
- shadow/sm: `0 1px 2px rgba(15,23,42,.06)`
- shadow/lg: `0 8px 24px rgba(15,23,42,.14)` (dialog, drawer, popover)

## 7. Danh mục component (~18, v1)
Icon placeholder (16px) · Button (Primary/Secondary/Ghost/Danger × S28/M32 × Default/Hover/Disabled) · Badge (Neutral/Success/Warning/Danger/Info/Brand × Subtle/Solid) · Delta (Up-Good, Up-Bad, Down-Good, Down-Bad, Flat) · Input (Default/Focus/Error/Disabled) · Select (Default/Open/Disabled) · Checkbox (Off/On/Indeterminate) · Tab item · Segmented item · Table (header cell trái/phải, cell Text/Number/Muted, row Default/Hover/Selected) · KPI Stat (Compact/Inline) · Source footnote · Nav item (Default/Hover/Active) · Banner (Info/Warning/Danger/Success) · Tooltip · Dialog shell · Drawer shell (480px) · Filter chip (Default/Active) · Empty state.

Quy tắc Delta: màu theo *tốt/xấu*, không theo tăng/giảm (CPA tăng = xấu = đỏ). Luôn kèm mũi tên và dấu, không dựa vào màu đơn thuần.

## 8. Ánh xạ sang code
- Token → CSS variables (`:root` = Light/Compact; `[data-theme=dark]`, `[data-density=regular]` ghi đè).
- Component → React + Tailwind dùng token, không hard-code màu.
- Chuỗi giao diện qua i18n (vi, en), theo CLAUDE.md.
- Component trạng thái phụ thuộc cờ (Việc tuần này, Creative, Nhật ký hành động, Rule tự động) vẫn dùng cùng bộ thành phần; cờ tắt thì mục không hiện ở sidebar.

## 9. Giới hạn hiện tại & việc cần PM quyết
- Figma gói Starter: **1 mode/collection** (không có Light/Dark trong Figma) và **đã hết hạn mức gọi MCP**, nên file Figma chưa có biến, style, component.
- Lựa chọn tiếp:
  1. Chờ hạn mức làm mới rồi tôi dựng tiếp (token → component → ảnh chụp kiểm tra).
  2. Nâng gói Figma (Professional) để dựng liền mạch.
  3. Duyệt Gate 2 trên tài liệu này trước, dựng Figma song song với bước wireframe.
- Chưa làm: kiểm tra trực quan; số liệu độ tương phản (WCAG) cần kiểm lại khi có bản dựng.
