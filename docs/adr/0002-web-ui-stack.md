# ADR-0002: Thư viện giao diện và cách tổ chức apps/web

- Trạng thái: Đã chấp nhận (Claude Code theo ủy quyền ADR-0001; PM review cuối)
- Ngày: 22/10/2026

## Bối cảnh
L3 mục 2 chọn Next.js (App Router), React, Tailwind CSS, shadcn/ui, next-intl, Recharts. shadcn/ui không phải một gói npm mà là mã component chép vào repo, dựa trên một số thư viện nền. Design system (Penpot, `docs/design/design-system.md`) quy định icon nét 2px lưới 24px.

## Quyết định
1. **Phiên bản:** Next.js 15.x (L3 ghi 15.x; không lên 16 trong lượt này), React 19, Tailwind CSS 4, next-intl 4.
2. **Thư viện nền của shadcn/ui** (được coi là một phần của lựa chọn shadcn/ui ở L3): `radix-ui` (primitive dialog, dropdown, popover, tabs…), `class-variance-authority`, `clsx`, `tailwind-merge`. Component nằm trong `packages/ui` (dùng chung web + mẫu báo cáo/PDF, L3 mục 3).
3. **Icon:** `lucide-react` (nét 2px, lưới 24px, khớp quy tắc icon của design system).
4. **Thông báo nổi (toast):** `sonner` (component toast chuẩn của shadcn/ui).
5. **Phiên đăng nhập:** `@supabase/ssr` + `@supabase/supabase-js` (Supabase Auth theo L3, ADR-0001).
6. **i18n:** next-intl không dùng tiền tố locale trong URL cho app; locale lấy theo thứ tự: cookie `locale` → hồ sơ người dùng → `vi`. Chuỗi nằm trong `apps/web/messages/{vi,en}.json`; test bắt buộc hai file có cùng tập khóa.
7. **Token giao diện:** CSS variables theo tên token Penpot (`--color-bg-surface`…), khai báo trong `packages/ui/src/tokens.css`, ánh xạ vào theme Tailwind. Không hard-code màu trong component.
8. **Truy cập dữ liệu:** Server Component đọc dữ liệu qua `packages/core` với ngữ cảnh workspace đã kiểm quyền; mọi thao tác ghi đi qua REST `/api/v1/*` (Route Handler) dựng bằng hàm `route()` chung: xác thực, chọn workspace, kiểm vai trò, kiểm cờ phía server, validate zod, map `AppError` → JSON lỗi chuẩn L3 10.1.

## Hệ quả
- Thêm thư viện giao diện khác (bảng dữ liệu, form…) cần ADR mới.
- Bộ test cách ly workspace duyệt mọi file `app/api/**/route.ts`; route mới không có probe cách ly thì `pnpm test` đỏ.
