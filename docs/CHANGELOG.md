# Changelog

Mỗi feature merge vào `develop` có một mục: thay đổi gì, test tự động đi kèm, vùng bảo vệ bị chạm, và cách PM kiểm tra thủ công. PM verify trên `develop` trước khi merge `develop → main`.

## [003] Cờ tính năng theo workspace — 2026-10-22

**Thay đổi**
- Bảng `app.feature_flags` (mặc định tắt) và `app.flag_change_log` (append-only, trigger chặn sửa/xóa ở mức DB). RLS bật.
- `packages/core/flags`: `isEnabled`, `assertEnabled` (cờ tắt → 404 `FEATURE_DISABLED`, thông điệp không lộ tên cờ), `getFlags`, cache 60 giây qua interface (Redis ở web/worker; xóa cache khi đổi cờ).
- Bật cờ: chỉ staff có `can_enable_flags`; bắt buộc lý do; chạy checklist kỹ thuật (module khác đăng ký mục kiểm tra qua `registerFlagCheck`); checklist chưa đạt thì chặn, PM vượt được khi ghi lý do (log `override = true`). Không bao giờ bật cờ con khi cờ cha tắt, kể cả khi vượt.
- Tắt cờ: mọi staff; tắt dây chuyền cờ phụ thuộc (p0 → p1 → p2a → p2b); chạy handler đăng ký qua `onFlagDisabled` (dùng ở B7 để hủy action pending). Dữ liệu giữ nguyên.

**Test tự động** (`packages/core/src/flags/flags.test.ts`, 16 test): mặc định tắt; 404 không lộ tên cờ; chỉ PM bật; thành viên workspace không tự bật; bắt buộc lý do; nhật ký kèm checklist; chặn cờ con khi cờ cha tắt; checklist chặn và vượt có ghi log; kiểm tra lỗi coi là chưa đạt; tắt dây chuyền + handler; người ngoài không tắt được; cache và xóa cache; cách ly workspace; nhật ký append-only ở DB; chuỗi phụ thuộc.

**Vùng bảo vệ:** `packages/core/flags/**`, `packages/db/**`.

**PM kiểm tra:** `pnpm test` xanh. Giao diện bật cờ (AD01, AD02) đến ở feature 042.

## [002] Database lõi, RLS, tenancy — 2026-10-22

**Thay đổi**
- `packages/db`: Drizzle ORM + postgres.js; schema `app` và `analytics`; tiền `numeric(18,4)`, tỷ lệ `numeric(10,6)`. Lệnh `pnpm db:generate`, `db:migrate`, `db:check` (thất bại khi schema có thay đổi chưa sinh migration).
- Bảng: `users`, `workspaces`, `memberships` (vai trò owner/manager/buyer, `client_access`, `approve_client_ids`), `clients`, `invitations` (chỉ lưu hash token), `staff`, `audit_events`.
- RLS bật trên mọi bảng; hàm `app.enable_workspace_rls()` dùng cho bảng mới; role `authenticated` không được cấp quyền trực tiếp.
- `packages/core/shared`: `AppError` có `code` và HTTP status, token ngẫu nhiên 32 byte, so sánh hằng thời gian, kiểu `WorkspaceCtx`/`ActorCtx`.
- `packages/core/tenancy`: ma trận quyền theo vai trò (từ ux-requirements mục 6), quyền theo Client, quyền duyệt P2a (owner/manager mặc định; buyer khi owner cấp theo Client), tạo/sửa workspace, thành viên, lời mời 7 ngày (một lần dùng, email phải trùng), chuyển quyền owner cho manager (ADR-0001 B8), Client (tạo, sửa, lưu trữ).
- Test tích hợp chạy trên database `adxlens_test` tạo lại mỗi lần `pnpm test` (cần Postgres: Supabase local hoặc service CI).

**Test tự động**
- `packages/db/src/rls.test.ts`: mọi bảng bật RLS; role authenticated chỉ thấy workspace trong JWT; không claim thì không thấy gì; bảng staff không đọc được.
- `packages/core/src/tenancy/permissions.test.ts`: ma trận quyền, quyền theo Client, quyền duyệt (8 test).
- `packages/core/src/tenancy/tenancy.test.ts`: workspace, lời mời (hợp lệ, hết hạn, sai email, token sai, Client workspace khác), vai trò, xóa thành viên, chuyển quyền owner, Client theo quyền và theo workspace (15 test).

**Vùng bảo vệ:** `packages/db/**` (schema, migration, RLS).

**PM kiểm tra:** `pnpm test` xanh; mở Supabase Studio (http://127.0.0.1:54323) thấy schema `app` với các bảng trên, mỗi bảng có biểu tượng RLS bật.

## [001] Monorepo, CI, môi trường local — 2026-10-22

**Thay đổi**
- Monorepo pnpm + Turborepo, TypeScript strict, ESLint (flat config), Prettier, Vitest.
- `packages/config`: schema biến môi trường bằng zod; lỗi chỉ nêu tên biến, không in giá trị.
- `.env.example` đầy đủ biến; `pnpm env:init` sinh `.env.local` với khóa ngẫu nhiên và key Supabase local.
- Supabase CLI (`infra/supabase/config.toml`): bật xác minh email, mật khẩu ≥ 8 ký tự. Redis qua `infra/docker/compose.yml`.
- `pnpm dev`: bật Redis + Supabase, chạy migration, chạy web + worker.
- `scripts/check-boundaries.mjs` (chạy trong `pnpm lint`): chặn import sâu giữa module core, chặn mọi chỗ ngoài `packages/core/execution` dùng phần ghi của Meta (quy tắc tuyệt đối 3).
- CI GitHub Actions: lint, format, typecheck, test + coverage, db:check, quét bí mật (gitleaks), audit phụ thuộc. CODEOWNERS, PR template, `docs/onboarding.md`.

**Test tự động**
- `packages/config/src/env.test.ts`: mặc định local, khóa rỗng, danh sách tài khoản test, khóa sai độ dài, lỗi không lộ bí mật.
- `scripts/lib/boundaries.test.ts`: 5 trường hợp ranh giới import.

**Vùng bảo vệ:** `infra/**` (compose, config Supabase).

**PM kiểm tra:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` xanh.
