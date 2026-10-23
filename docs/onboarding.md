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

**Cách nhanh (PM test thủ công):** double-click `Mo-AdxLens.cmd` ở gốc repo (hoặc `pnpm start:local`). Script tự mở Docker Desktop nếu chưa chạy, `pnpm install` khi lockfile đổi, bật Redis + Supabase, tạo `.env.local` (chỉ điền key Supabase còn trống, không tạo lại khóa mã hóa token), chạy migration, tạo tài khoản staff `pm@adxlens.local` / `AdxLens@local1` (bật cờ được), bật web + worker rồi mở trình duyệt. Đóng cửa sổ để tắt app. Chỉ dùng ở local.

Cách từng bước:

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

## 8. Thực thi trên Meta (P2a) — chỉ local / staging

- Mọi lời gọi ghi đi qua `packages/core/execution` (ADR-0008). Local dùng Meta giả (`META_MOCK=1`): ghi vào bộ nhớ của worker, đọc lại được.
- Test tích hợp trên tài khoản Meta **test** (bắt buộc trước khi merge thay đổi `execution` và trước khi bật cờ cho khách): đặt `APP_ENV=staging`, `META_WRITE_TEST_ACCOUNTS=act_…` (danh sách cho phép), `META_TEST_WRITE_TOKEN` (token người dùng test), rồi `pnpm execution:check -- <ad_id> <adset_id>`. Script từ chối đối tượng ngoài danh sách, chạy đủ: tạm dừng/bật lại ad và ad set, ngân sách +5% rồi trả lại, nhân bản (bản sao PAUSED — xóa tay).
- Thử ở local với Meta giả: `META_MOCK=1 META_WRITE_TEST_ACCOUNTS=act_100000001 pnpm execution:check -- <ad_id> <adset_id>` (lấy id ad và ad set có ngân sách ngày của tài khoản `act_100000001` trong bảng `analytics.entities` sau khi đồng bộ).

## 9. Bản đồ module và luồng dữ liệu chính

```
Meta Marketing API ──(chỉ đọc, packages/meta-client)──► ingestion ──► analytics.insights_daily / entities
        ▲                                                     │
        │ (ghi — CHỈ packages/core/execution)                  ▼
   execution ◄── recommendation (Việc tuần này, creative)   reconciliation (≤ 1%) ──► insight (phát hiện)
        ▲                                                     │                          │
   automation rules (P2b)                                     ▼                          ▼
                                                   reporting (báo cáo, PDF, chia sẻ, lịch, digest)
                                                              │
                                                   notification (trong app + email) · billing · flags · ops
```

| Module (`packages/core/src`) | Việc chính |
|---|---|
| `tenancy` | workspace, thành viên, vai trò, quyền theo Client |
| `connections` | OAuth Meta, mã hóa token, tài khoản QC, quyền ghi, xóa dữ liệu, tài khoản mẫu |
| `ingestion` | backfill 90 ngày (lô 7 ngày), daily sync, trạng thái đồng bộ |
| `reconciliation` | so số liệu theo ngày với Meta, ngưỡng 1% (khóa test) |
| `insight` | rule audit, phát hiện, health score |
| `recommendation` | creative library, Việc tuần này, kết quả trước/sau, onboarding buyer |
| `reporting` | báo cáo, tóm tắt LLM + kiểm số, chia sẻ, PDF, lịch gửi, digest |
| `notification` | thông báo, email, cài đặt |
| `billing` | gói, hạn mức, Stripe, PayOS, hoà vốn |
| `execution` | Execution Gateway, guardrails, kill switch, breaker, nhật ký, hoàn tác, rule tự động |
| `flags` | cờ theo workspace + checklist |
| `ops` | sức khỏe, sự cố, playbook, kênh báo đội, truy vấn xuyên workspace có chú thích |

## 10. Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `pnpm dev` | Redis + Supabase + migration + web + worker |
| `pnpm lint && pnpm typecheck && pnpm test` | kiểm tra trước khi mở PR (`pnpm db:check` khi chạm DB) |
| `pnpm test:e2e` | Playwright (tự bật web + worker riêng) |
| `pnpm db:generate` / `pnpm db:migrate` | sinh / áp migration |
| `pnpm job:trigger -- <job> '<json>'` | chạy một job ngay (local/staging) |
| `pnpm e4:report -- --workspace <id>` | báo cáo độ lệch + phủ dữ liệu |
| `pnpm execution:check -- <ad_id> <adset_id>` | test tích hợp lớp ghi trên tài khoản Meta test (staging) |
| `pnpm killswitch -- on|off [--workspace <id>] --reason "…"` | kill switch dự phòng |
| `pnpm rules:simulate -- <rule_id> [--days 14]` | giả lập chạy thử rule (chỉ local) |
| `pnpm smoke -- <base_url>` | smoke test sau deploy |
| `pnpm tokens:rotate` | xoay khóa mã hóa token (runbook rotate-token-key) |
| `pnpm drill` | diễn tập 3 sự cố trên local (mục 12) |

## 11. E2E (Playwright, `apps/web/e2e`)

| Spec | Luồng |
|---|---|
| `auth-workspace` | trang công khai, đăng ký → xác minh → workspace, mời thành viên, lỗi đăng nhập |
| `demo` | tài khoản mẫu, banner, báo cáo mẫu |
| `clients-assign` | S04 → S05 gán Client → S06 → C01/C02 |
| `reports-share` | PM bật cờ → báo cáo → chia sẻ → trang công khai → PDF → thu hồi |
| `billing` | Gói & thanh toán, thông tin hóa đơn, ST04, M06 hoà vốn |
| `creatives` | creative library, so sánh, Việc tuần này, kết quả trước/sau |
| `p2a` | quyền ghi → duyệt → thực hiện + xác minh → hoàn tác → kill switch |
| `p2b` | rule từ mẫu → backtest → chạy thử → giả lập 14 ngày → chạy thật → hiệu quả |
| `safety` | các thử "phải thất bại đúng cách" (implementation-guide 4.4) |

## 12. Diễn tập sự cố

`pnpm drill` (chỉ local, cần `pnpm dev` đang chạy DB) tạo workspace "Diễn tập sự cố …" và giả lập lần lượt:
1. **Meta rate limit** → health check mở sự cố, playbook `meta_rate_limited` hoãn queue `sync`;
2. **Đối chiếu lệch** → sự cố `reconciliation_warning`, báo cáo bị khóa chia sẻ, playbook `reconcile_retry` lên lịch đồng bộ lại;
3. **Thực thi lỗi** → hành động thất bại, sự cố `execution_failed` P1, breaker mở sau đủ số lỗi.

Mỗi bước in ĐẠT / LỖI; sự cố hiện ở `/admin/incidents` (kèm cảnh báo nếu cấu hình kênh báo đội). Thêm `--cleanup` để xóa workspace diễn tập và đóng các sự cố sau khi xem.

## 13. Tài liệu ở đâu

- `CLAUDE.md` — quy tắc tuyệt đối, cách làm task / review / chẩn đoán.
- `docs/prd.md`, `docs/architecture/L1|L2|L3` — sản phẩm và kiến trúc; `docs/adr/` — quyết định (0008–0012 cho thực thi trên Meta).
- `docs/rules/` — ngưỡng rule audit, phân loại creative, xếp hạng gợi ý.
- `docs/runbooks/` — xử lý sự cố; `docs/tech-debt.md` — chỗ làm tạm; `docs/CHANGELOG.md` — thay đổi theo feature.

## 14. Tuần đầu cho dev mới (L3 20)

1. Chạy local (mục 1–2), chạy `pnpm test` và `pnpm test:e2e`.
2. Đọc `packages/core/execution` và bộ test cách ly workspace (`tests/isolation`) — vùng rủi ro cao nhất.
3. Đọc `docs/tech-debt.md`, đề xuất thứ tự ưu tiên lại.
4. Thay đổi đầu tiên: một mục nhỏ trong tech-debt, theo `.github/pull_request_template.md`.

