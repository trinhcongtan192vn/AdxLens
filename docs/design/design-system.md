# AdxLens — Design System v1.0

> **Nguồn thiết kế chính thức: Penpot**, file "AdxLens Design":
> https://design.penpot.app/#/workspace?team-id=da05d154-084a-817e-8008-d3e89206539f&file-id=8af72ccb-2daf-802c-8008-d3f10464db3a
>
> | Trang Penpot | Nội dung |
> |---|---|
> | Foundations | Bảng tổng hợp "Design System — AdxLens" v1.0: màu, typography, spacing/radius/elevation, icon, component kèm quy tắc dùng |
> | Design System | Component chính (main component) và variant, mục 7 |
> | Wireframes | 101 khung màn theo mã danh mục (`ux-requirements.md` mục 6, 9) và prototype luồng F1–F12 |
> | Sitemap & Flows | Sitemap và 12 user flow (`sitemap-flows.md`) |
>
> Tài liệu này là bản chép bằng chữ của token và quy tắc trong Penpot, đồng bộ ngày 22/10/2026. Khi lệch: **token theo Penpot** (bộ token `primitives`, `semantic`, `dimensions`), sửa tài liệu này cho khớp. Figma và `wireframes-lofi.html` không còn dùng.

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
- **chart 1–6:** #4F46E5 · #0284C7 · #059669 · #D97706 · #EC4899 · #8B5CF6 (chart 2–4 đã đậm lên để đạt 3:1 trên nền trắng, xem `validation.md`)
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
| border/control | gray/500 | chưa định nghĩa |
| brand/primary | indigo/600 | indigo/500 |
| brand/primary-hover | indigo/700 | indigo/600 |
| brand/primary-subtle | indigo/50 | indigo/700 @ 25% |
| brand/on-primary | white | white |
| status/{success,warning,danger,info}-fg | *-700 | *-200 |
| status/…-bg | *-50 | *-600 @ 15% |
| status/…-border | *-200 | *-600 @ 40% |
| delta/positive | green/700 | green/500 (green/200 cho chữ nhỏ) |
| delta/negative | red/600 | red/200 cho chữ nhỏ |
| chart/1–6 | như primitives | tăng sáng 1 bậc |

Cột Dark chỉ có trong tài liệu này; Penpot chưa có theme Dark.

- `border/control`: viền của Input, Select, Checkbox ở trạng thái mặc định (đạt 3:1). Viền Error dùng red/600; viền focus dùng border/focus 2px.
- `border/default`: viền card, viền trang trí.

Tên token trong Penpot dạng `color.<nhóm>.<tên>` (ví dụ `color.bg.surface`) ↔ tên CSS `--color-<nhóm>-<tên>` (ví dụ `--color-bg-surface`). Spacing, radius, density: `space.N` ↔ `--space-N`, `radius.md` ↔ `--radius-md`, `density.row-height` ↔ `--density-row-height`.

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
- shadow/sm: `0 1px 2px rgba(15,23,42,.06)` (chỉ định nghĩa cho code; Penpot chưa dùng)
- shadow/lg: `0 8px 24px rgba(15,23,42,.14)` (dialog, drawer, popover; có trong Penpot)
- Quy tắc: lưới 4px; viền thay bóng, bóng chỉ cho lớp nổi.

## 6a. Icon
Nét 2px, lưới 24px, hiển thị 16px trong bảng và sidebar. Màu theo ngữ cảnh: text/tertiary mặc định, brand/primary khi đang chọn. Penpot chưa có bộ icon thành component; khi code chọn một bộ icon nét 2px (cần ADR nếu thêm thư viện, theo CLAUDE.md).

## 7. Danh mục component
**Có trong Penpot (trang Design System, 17 component):**

| Component | Variant trong Penpot |
|---|---|
| Button | Kind Primary/Secondary/Ghost/Danger × Size S (28) / M (32) × State Default/Hover/Disabled |
| Badge | Tone Neutral/Success/Warning/Danger/Info/Brand × Style Subtle/Solid |
| Delta | Direction Up-Good/Up-Bad/Down-Good/Down-Bad/Flat |
| Input | State Default/Focus/Error/Disabled |
| Select | State Default/Open/Disabled |
| Checkbox | State Off/On/Indeterminate |
| Tab item | State Default/Hover/Active |
| Segmented item | State Off/On |
| Filter chip | State Default/Active |
| Nav item | State Default/Hover/Active |
| Banner | Tone Info/Warning/Danger/Success |
| Table header cell | một dạng (nền subtle, chữ text/secondary viết hoa) |
| Table cell / Number | một dạng (căn phải, tabular-nums) |
| KPI Stat | một dạng (tile nhỏ gọn, kèm so sánh kỳ trước và dòng nguồn) |
| Source footnote | một dạng |
| Tooltip | một dạng (nền bg/inverse) |
| Empty state | một dạng |

**Chỉ có trong tài liệu, chưa thành component Penpot (dựng khi code, theo bố cục trong các khung Wireframes):** Icon · Table cell Text/Muted, Table row Default/Hover/Selected, hàng tổng in đậm · KPI Stat dạng Inline · Dialog shell · Drawer shell (480px) · Radio (S07 cần, xem `ux-requirements.md` 9.2).

Quy tắc dùng (từ trang Foundations): một nút Primary mỗi vùng thao tác; control cao 28px, focus viền indigo 2px, lỗi viền đỏ kèm thông điệp; trạng thái đang chọn chỉ dùng indigo; banner đặt đầu vùng nội dung, mỗi lần một cái; bảng hàng 32px, header nền subtle viết hoa, hàng chọn dùng bg/selected.

Quy tắc Delta: màu theo *tốt/xấu*, không theo tăng/giảm (CPA tăng = xấu = đỏ). Luôn kèm mũi tên và dấu, không dựa vào màu đơn thuần.

## 8. Ánh xạ sang code
- Token → CSS variables (`:root` = Light/Compact; `[data-theme=dark]`, `[data-density=regular]` ghi đè).
- Component → React + Tailwind dùng token, không hard-code màu.
- Chuỗi giao diện qua i18n (vi, en), theo CLAUDE.md.
- Component trạng thái phụ thuộc cờ (Việc tuần này, Creative, Nhật ký hành động, Rule tự động) vẫn dùng cùng bộ thành phần; cờ tắt thì mục không hiện ở sidebar.

## 9. Giới hạn hiện tại
- Penpot chỉ có Light + Compact; Dark và Regular chỉ có trong tài liệu (mục 3.2, 4), chưa có bản dựng.
- Nav item trên các màn Wireframes đã tách khỏi component; sửa component gốc không lan sang màn (xem `validation.md` mục 3).
- Các component ở dòng "Chỉ có trong tài liệu" của mục 7 chưa dựng trong Penpot.
- Độ tương phản đã kiểm bằng công thức (`validation.md`); chưa kiểm bàn phím, màn hình đọc, bản tiếng Anh.
