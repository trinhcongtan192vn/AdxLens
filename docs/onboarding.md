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

## 5. Đồng bộ, đối chiếu, vận hành

- `pnpm dev` chạy cả worker: nhập tài khoản ở S04 → backfill 90 ngày (lô 7 ngày) → đối chiếu với Meta (ngưỡng 1%). `META_MOCK=1` dùng dữ liệu giả (tài khoản "Thời trang Linh" lệch 1,4% ở ngày cách hôm nay 3 ngày để thử luồng lệch).
- Lịch định kỳ (worker): `ops:health_check` mỗi 5 phút (kèm playbook `meta_rate_limited`), daily sync mỗi giờ cho tài khoản đang 03:00 giờ địa phương, `maintenance:daily_tick` 09:00 giờ Việt Nam (playbook `token_expiring`).
- Báo cáo E4 (độ lệch + mức phủ dữ liệu theo tài khoản, Markdown): `pnpm e4:report -- --workspace <uuid> [--days 30]`. Chỉ chạy ở local/staging.
- `pnpm test:e2e` tự bật web và một worker riêng.
- PDF báo cáo (R07): worker dùng Playwright Chromium. Lần đầu chạy `pnpm --filter @adxlens/worker exec playwright install chromium`. Môi trường triển khai worker-render cần Chromium (image Playwright).
- Kích hoạt job ngay (dev/staging, không production): `pnpm job:trigger -- <tên job> '<payload JSON>'`, ví dụ `pnpm job:trigger -- maintenance:report_tick '{"tick":"manual"}'` (lịch gửi + digest đến giờ), `pnpm job:trigger -- notify:digest '{"workspaceId":"<uuid>","week":"2026-10-26"}'`. Payload được kiểm theo schema của job.

## 6. Thanh toán thử (Stripe test mode)

- Lấy khóa **test** (`sk_test_…`) từ Stripe Dashboard ở chế độ Test, điền `STRIPE_SECRET_KEY` trong `.env.local`. Không bao giờ dùng khóa live ở local/staging.
- Webhook cục bộ: `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`, chép `whsec_…` vào `STRIPE_WEBHOOK_SECRET`, khởi động lại `pnpm dev`.
- Cài đặt → Gói & thanh toán → "Chọn gói" → thẻ thử `4242 4242 4242 4242` → ST04. Gói chỉ đổi khi webhook tới (trang ST04 không tự đổi gói).
- Thử thanh toán thất bại: thẻ `4000 0000 0000 0341` hoặc `stripe trigger invoice.payment_failed` → banner thanh toán thất bại + email E05 (Mailpit).
- Chưa có khóa: các nút thanh toán báo "Thanh toán chưa sẵn sàng" (API 503), phần còn lại của app chạy bình thường.
- Giá gói: sửa dòng trong `app.billing_plans` (Supabase Studio). Stripe dùng `monthly_price_usd` nếu có, không thì VND.

## 7. Thanh toán thử qua PayOS (QR / chuyển khoản VND)

- Tạo kênh thanh toán **thử nghiệm** trên my.payos.vn, điền `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` trong `.env.local`.
- Webhook: PayOS cần URL công khai → dùng tunnel (vd. `cloudflared tunnel --url http://localhost:3000`) và khai báo `<tunnel>/api/v1/webhooks/payos` trong kênh thanh toán. Không có webhook vẫn thử được: khi PayOS chuyển về ST04, trang tự tra trạng thái đơn.
- Cài đặt → Gói & thanh toán → phương thức "QR / chuyển khoản (VND)" → "Chọn gói" → trang PayOS → thanh toán → ST04.
- PayOS trả theo kỳ: job `maintenance:daily_tick` nhắc gia hạn trước 7 và 1 ngày; hết kỳ chưa trả → quá hạn (ân hạn 7 ngày) → Free. Thử ngay: `pnpm job:trigger -- maintenance:daily_tick '{"tick":"manual"}'`.
