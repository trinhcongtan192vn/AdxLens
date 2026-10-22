# Onboarding — chạy AdxLens ở local

Dành cho dev mới. Đọc `CLAUDE.md` trước: quy tắc tuyệt đối áp dụng cho cả người và agent.

## 1. Cài đặt (một lần)

| Công cụ | Phiên bản |
|---|---|
| Node.js | 22 LTS |
| pnpm | 10 (`corepack enable`) |
| Docker Desktop | backend WSL2 trên Windows |
| Git | bất kỳ bản gần đây |

Supabase CLI cài qua `pnpm install` (gói `supabase`), không cần cài riêng.

## 2. Chạy lần đầu

```powershell
pnpm install
pnpm env:init            # tạo .env.local, sinh khóa ngẫu nhiên
pnpm dev                 # Redis + Supabase local + migration + web + worker
pnpm env:init --force    # lần đầu: chạy lại sau khi Supabase đã lên để lấy key
```

| Dịch vụ | Địa chỉ |
|---|---|
| Web | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (email local) | http://127.0.0.1:54324 |
| Postgres | `postgres://postgres:postgres@127.0.0.1:54322/postgres` |
| Redis | `redis://127.0.0.1:6379` |

`META_MOCK=1` trong `.env.local` cho phép chạy toàn bộ luồng với dữ liệu Meta giả, không cần app Meta.

## 3. Kiểm tra trước khi mở PR

```powershell
pnpm lint && pnpm typecheck && pnpm test
pnpm db:check            # khi chạm packages/db
```

`pnpm test` cần Postgres: dùng Postgres của Supabase local (đặt `TEST_DATABASE_URL`, mặc định là database `adxlens_test` trên cùng server).

## 4. Cấu trúc repo

Xem `docs/architecture/L3-technical.md` mục 3. Tóm tắt:

- `apps/web` (Next.js), `apps/worker` (BullMQ).
- `packages/core/src/<module>`: logic nghiệp vụ; import module khác chỉ qua `@adxlens/core/<module>`.
- `packages/db`, `packages/meta-client`, `packages/jobs`, `packages/ui`, `packages/config`.

`pnpm lint` chạy thêm `scripts/check-boundaries.mjs`: chặn import sâu giữa module và chặn mọi chỗ ngoài `packages/core/execution` dùng phần ghi của Meta.
