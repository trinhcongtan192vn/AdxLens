# AdxLens — Kiến trúc L3: Kỹ thuật & Triển khai (Physical / Technical)

| | |
|---|---|
| **Sản phẩm** | AdxLens — Báo cáo & Ads Intelligence cho Agency (Meta Ads) |
| **Phiên bản** | 0.3 |
| **Ngày** | 22/10/2026 |
| **Tài liệu nguồn** | PRD AdxLens v0.4; L1 — Khái niệm; L2 — Logic |
| **Người đọc** | PM, Claude Code, dev part-time sau này |
| **Phạm vi** | Chi tiết cho V0–P2b (xây một lượt). P3 ngoài phạm vi |
| **Đội ngũ** | 2 người (PM, marketing) + **Claude Code viết toàn bộ code**. Dev part-time sau khi có khách trả phí |

> **Thay đổi so với v0.2:** không có engineer người thật ở giai đoạn đầu; Claude Code viết code, PM là người chịu trách nhiệm kỹ thuật cuối cùng. Hệ quả: (1) phân công lại (mục 1.1); (2) review hai phiên AI độc lập + CI là cổng cứng + PM duyệt thư mục quan trọng (mục 13.1); (3) thêm cờ tính năng để xây P0 → P2b một lượt và PM bật dần (mục 18); (4) thêm lớp vận hành tự động và ranh giới quyền của agent (mục 19); (5) trực sự cố chỉ có PM, nên mức tự khắc phục được nâng lên; (6) kế hoạch xây theo module thay cho theo người (mục 17); (7) chuẩn bị bàn giao cho dev part-time (mục 20); (8) `CLAUDE.md` ở gốc repo là quy ước bắt buộc cho mọi phiên Claude Code. Stack cốt lõi giữ nguyên.

> **Lưu ý về phiên bản và giá dịch vụ:** các phiên bản công nghệ và nhà cung cấp dưới đây là lựa chọn tại thời điểm viết (10/2026) dựa trên tiêu chí ở mục 1. Trước khi khởi tạo dự án, kiểm tra lại phiên bản LTS hiện hành, vùng triển khai khả dụng và bảng giá của từng nhà cung cấp. Các giới hạn của Meta Marketing API (phiên bản, rate limit, điều kiện App Review) **phải xác minh trong E4** trước khi cam kết.

---

## 1. Tiêu chí chọn công nghệ

| Tiêu chí | Hệ quả |
|---|---|
| Không có engineer hay DevOps người thật | Chỉ dùng dịch vụ quản lý (managed/PaaS); không có thành phần nào cần vá hệ điều hành hay vận hành máy chủ; ưu tiên công nghệ phổ biến để Claude Code viết đúng và dev part-time sau này dễ tiếp nhận |
| Claude Code viết toàn bộ code | Một ngôn ngữ (TypeScript) có kiểu chặt (`strict`), ranh giới module rõ, test dày; mọi quy ước ghi trong `CLAUDE.md` |
| Thị trường đầu VN/SEA, sẵn sàng toàn cầu | Vùng triển khai Singapore; CDN toàn cầu cho web và trang báo cáo công khai |
| Số liệu phải khớp Meta | PostgreSQL với kiểu số thập phân chính xác; snapshot bất biến; test đối chiếu là cổng CI |
| Token Meta là bí mật cấp cao nhất | Mã hóa cột bằng khóa trong secret manager; chỉ worker giải mã |
| Chi phí thấp ở giai đoạn đầu | Gói free/hobby của các dịch vụ cho V0; nâng cấp khi có khách trả phí |
| P2 (ghi lên Meta) nằm trong phạm vi xây | Execution Gateway được xây đầy đủ nhưng chỉ chạy thật trên staging với tài khoản Meta test cho tới khi PM bật cờ; vùng code bảo vệ cao nhất (mục 13.1) |
| Không có người trực kỹ thuật | Lớp vận hành tự động (mục 19) xử lý lỗi thường gặp; con người chỉ được gọi cho quyết định |

### 1.1 Phân công sở hữu

| Khu vực | Viết | Review | Duyệt merge | Ghi chú |
|---|---|---|---|---|
| `packages/core/execution`, `packages/db` (migration, RLS), `infra/` | Claude Code (phiên viết) | Claude Code (phiên review độc lập) | **PM bắt buộc** | Vùng bảo vệ cao nhất; xem mục 13.1 |
| `packages/core` (các module khác), `packages/meta-client`, `apps/worker` | Claude Code | Claude Code (phiên review độc lập) | **PM bắt buộc** | PM định nghĩa ngưỡng và kỳ vọng của quy tắc audit |
| `apps/web`, `packages/ui`, i18n, nội dung email | Claude Code | Claude Code (phiên review độc lập) | Tự merge khi CI xanh và review đạt | PM kiểm tra trên preview |
| Hạ tầng trên dashboard nhà cung cấp, secrets production | **PM** (thao tác tay theo runbook) | — | — | Claude Code không có quyền vào |
| Runbook, hỗ trợ khách, status page | Marketing (tuyến 1) → PM (tuyến 2) | — | — | Marketing có quyền đọc dashboard nội bộ và Sentry |
| Meta App Review, Business Verification, chính sách quyền riêng tư | PM | Claude Code soạn phần kỹ thuật | — | |
| Bật/tắt cờ tính năng | **PM** bật; bất kỳ ai trong đội có thể tắt | — | — | Mục 18 |
| Trực sự cố | **PM** | Marketing nhận cảnh báo kênh khách | — | Mục 12.1 |

---

## 2. Tổng quan stack

| Lớp | Lựa chọn | Phiên bản (kiểm tra lại) | Vai trò |
|---|---|---|---|
| Ngôn ngữ | TypeScript | 5.x | Toàn bộ codebase |
| Runtime | Node.js | 22 LTS | API, worker |
| Web + API | Next.js (App Router, Route Handlers) | 15.x | Dashboard, trang báo cáo công khai, REST API |
| UI | React, Tailwind CSS, shadcn/ui | — | Giao diện |
| i18n | next-intl | — | vi/en |
| Biểu đồ | Recharts | — | Xu hướng trong phát hiện và báo cáo |
| ORM & migration | Drizzle ORM + drizzle-kit | — | Schema, migration, truy vấn kiểu an toàn |
| Cơ sở dữ liệu | PostgreSQL (Supabase) | 16 | Operational DB và Analytics Store (tách schema) |
| Xác thực | Supabase Auth | — | Email/password, magic link; phiên JWT |
| Object storage | Supabase Storage (S3-compatible) | — | PDF, logo, thumbnail |
| Queue & scheduler | BullMQ trên Redis | BullMQ 5.x, Redis 7 | Jobs nền, lịch cron |
| Redis | Upstash Redis (Singapore) | 7 | Queue, cache, rate limit |
| Worker hosting | Railway (hoặc Fly.io) | — | Tiến trình worker chạy dài, có Chromium cho PDF |
| Web hosting | Vercel | — | Next.js, edge CDN toàn cầu |
| PDF | Playwright (Chromium) trong worker | — | Kết xuất cùng mẫu với trang web |
| LLM | Claude API (Anthropic) | model Sonnet hiện hành | Tóm tắt/diễn giải báo cáo |
| Email | Resend | — | Digest, lịch báo cáo, cảnh báo |
| Thanh toán | Stripe (quốc tế) + cổng nội địa VN (PayOS hoặc tương đương) ở P1 | — | Gói trả phí |
| Quan sát | Sentry (lỗi), Axiom hoặc Better Stack (log), Vercel/Railway metrics | — | Vận hành |
| Phân tích sản phẩm | PostHog | — | Instrumentation (PRD 7.7) |
| Secrets | Biến môi trường trên Vercel/Railway + Doppler (tùy chọn) | — | Khóa mã hóa, API key |
| CI/CD | GitHub Actions | — | Lint, test, migration, deploy |
| Mã nguồn | GitHub, monorepo (pnpm workspaces + Turborepo) | — | `apps/web`, `apps/worker`, `packages/*` |

**Lý do chọn Next.js cho cả web và API:** một khung, một deploy, Route Handlers đủ cho REST ở quy mô này; worker tách riêng để chạy việc dài. Nếu sau này API cần tách, `packages/core` đã chứa toàn bộ domain logic độc lập với Next.js.

**Lý do chọn Supabase:** gộp Postgres, Auth, Storage trong một dịch vụ quản lý có vùng Singapore; giảm số nhà cung cấp phải vận hành. Row Level Security (RLS) dùng như lớp bảo vệ thứ hai cho cách ly workspace.

---

## 3. Cấu trúc mã nguồn (monorepo)

```
adxlens/
├── apps/
│   ├── web/                      # Next.js: dashboard, public report, REST API (/app/api/v1/*)
│   └── worker/                   # Node: BullMQ workers + scheduler
├── packages/
│   ├── core/                     # Domain logic thuần (không phụ thuộc Next/BullMQ)
│   │   ├── tenancy/
│   │   ├── connections/
│   │   ├── ingestion/            # Meta adapter + normalizer
│   │   ├── reconciliation/
│   │   ├── insight/              # rules/*, engine, health score
│   │   ├── recommendation/       # P1
│   │   ├── reporting/            # report builder, LLM summarizer + number checker
│   │   ├── notification/
│   │   ├── execution/            # P2: gateway, guardrails, verifier, undo, rule engine (P2b)
│   │   ├── billing/
│   │   ├── flags/                # M11: cờ tính năng theo workspace, checklist phát hành
│   │   └── ops/                  # M12: health checks, playbooks tự khắc phục, incident
│   ├── db/                       # Drizzle schema, migrations, client
│   ├── meta-client/              # Meta Marketing API client (rate limit, retry, pagination)
│   ├── jobs/                     # Định nghĩa job names + payload types dùng chung
│   ├── ui/                       # Component dùng chung, mẫu báo cáo (web + PDF)
│   └── config/                   # tsconfig, eslint, env schema (zod)
├── infra/
│   ├── railway.toml              # service, env, scale
│   ├── vercel.json
│   ├── supabase/                 # config.toml, migrations do drizzle-kit sinh, RLS policies (.sql)
│   └── alerts/                   # định nghĩa cảnh báo Better Stack/Sentry dưới dạng file
├── docs/
│   ├── prd.md                    # PRD hiện hành
│   ├── architecture/             # L1, L2, L3
│   ├── adr/                      # Architecture Decision Records (ADR-0001-...)
│   ├── runbooks/                 # số liệu lệch, token hết hạn, backfill thất bại, thực thi lỗi
│   ├── release-log.md            # nhật ký bật/tắt cờ theo workspace (bản đọc của FlagChangeLog)
│   ├── tech-debt.md              # nợ kỹ thuật Claude Code ghi lại khi làm việc
│   └── onboarding.md             # tài liệu cho dev part-time
├── CLAUDE.md                     # quy ước bắt buộc cho mọi phiên Claude Code
└── .github/
    ├── CODEOWNERS                # packages/core, packages/db, apps/worker, infra → PM
    ├── pull_request_template.md  # nguyên nhân, phạm vi, test, rủi ro, vùng bảo vệ bị chạm
    └── workflows/
```

**Bổ sung mốc L (ADR-0003, 22/10/2026):** trong `apps/web/src/app` có ba route group: `(marketing)` cho trang công khai M01–M06 (`/`, `/pricing`, `/privacy`, `/terms`, `/data-deletion`, `/break-even`), `(auth)` cho A01–A06 (`/signup`, `/verify-email`, `/login`, `/forgot-password`, `/reset-password`, `/invite/[token]`, `/auth/callback`), `(app)` cho mọi màn cần đăng nhập. Xác thực bằng Supabase Auth (email + mật khẩu, bắt buộc xác minh email), phiên cookie qua `@supabase/ssr`; mọi thao tác auth chạy phía server và không tiết lộ email đã tồn tại.

**Quy tắc:** `apps/*` chỉ gọi `packages/core`; `core` không import từ `apps`. Mỗi module trong `core` có `index.ts` xuất interface công khai và test riêng. Mọi quyết định kiến trúc đáng kể (đổi nhà cung cấp, đổi schema lớn, thêm hành động ghi lên Meta) ghi thành một ADR trước khi merge. Mỗi phiên Claude Code chỉ làm trong một module hoặc một tính năng, để PR nhỏ và review được.

---

## 4. Hạ tầng & triển khai

### 4.1 Sơ đồ triển khai

```mermaid
flowchart TB
    subgraph Users["Người dùng"]
        B1[Trình duyệt agency]
        B2[Trình duyệt khách<br/>mở link báo cáo]
    end

    subgraph Edge["Vercel Edge Network (toàn cầu)"]
        CDN[CDN + TLS]
        NEXT[Next.js<br/>Serverless Functions<br/>region: sin1 (Singapore)]
    end

    subgraph SG["Vùng Singapore"]
        subgraph Supabase["Supabase project (ap-southeast-1)"]
            PG[(PostgreSQL 16<br/>schema: app, analytics)]
            AUTH[Supabase Auth]
            STO[(Storage bucket:<br/>reports, brand, creatives)]
        end
        REDIS[(Upstash Redis<br/>ap-southeast-1)]
        subgraph Railway["Railway (Singapore)"]
            W1[worker: sync/reconcile/audit]
            W2[worker: report/pdf/email<br/>có Chromium]
            SCH[scheduler<br/>BullMQ repeatable jobs]
        end
    end

    subgraph Ext["Dịch vụ ngoài"]
        META[Meta Graph API]
        LLM[Anthropic API]
        RESEND[Resend]
        STRIPE[Stripe / cổng VN]
        SENTRY[Sentry]
        PH[PostHog]
    end

    B1 --> CDN --> NEXT
    B2 --> CDN
    NEXT --> PG & AUTH & STO & REDIS
    NEXT -.enqueue.-> REDIS
    REDIS --> W1 & W2
    SCH --> REDIS
    W1 --> META & PG
    W2 --> PG & STO & LLM & RESEND
    NEXT --> STRIPE
    STRIPE -.webhook.-> NEXT
    META -.webhook.-> NEXT
    NEXT & W1 & W2 --> SENTRY
    NEXT --> PH
```

### 4.2 Thông số từng thành phần

| Thành phần | Nhà cung cấp / gói khởi điểm | Thông số | Ghi chú |
|---|---|---|---|
| Web/API | Vercel Pro (1 seat) | Serverless Functions, region `sin1`, memory 1024 MB, timeout 60 s | Request dài hơn 60 s phải đẩy sang worker |
| Worker | Railway, 2 service | `worker-core`: 1 vCPU / 1 GB RAM; `worker-render`: 2 vCPU / 2 GB RAM (Chromium) | Dockerfile riêng; scale replicas khi queue backlog > ngưỡng; healthcheck để Railway tự restart khi treo |
| Scheduler | Railway, 1 service nhỏ | 0.5 vCPU / 512 MB | Chỉ đăng ký repeatable jobs vào Redis; chạy 1 replica |
| PostgreSQL | Supabase Pro | Small compute (2 vCPU / 1 GB) khởi điểm; nâng Medium khi > 50 tài khoản ads | PITR 7 ngày; connection pooling (PgBouncer, transaction mode) cho serverless |
| Redis | Upstash (pay-as-you-go) | TLS, eviction tắt cho DB queue | Dùng DB riêng cho cache nếu cần eviction |
| Storage | Supabase Storage | Bucket private; link có chữ ký (signed URL) 1 giờ cho PDF | Logo public-read qua CDN |
| OS | Railway: Debian-based image Node 22 | — | Không có máy chủ tự quản |

### 4.3 Mạng & ranh giới tin cậy

Không có router/switch/firewall tự quản; toàn bộ là dịch vụ quản lý. Ranh giới mạng được cấu hình như sau:

| Kết nối | Cấu hình |
|---|---|
| Internet → Vercel | HTTPS/TLS 1.2+; HSTS; tên miền `app.adxlens.com` (dashboard) và `r.adxlens.com` (báo cáo công khai) |
| Vercel → Supabase | TLS; chuỗi kết nối qua pooler (cổng 6543); IP của Supabase hạn chế theo allowlist khi gói hỗ trợ |
| Railway → Supabase | TLS; kết nối trực tiếp (cổng 5432) cho worker vì cần transaction dài |
| Railway/Vercel → Upstash | TLS (rediss://) |
| Worker → Meta | HTTPS; chỉ worker giữ token đã giải mã |
| Meta → Vercel (webhook) | Xác minh chữ ký `X-Hub-Signature-256` bằng app secret |
| Stripe → Vercel (webhook) | Xác minh chữ ký bằng webhook secret |
| Supabase RLS | Bật trên mọi bảng trong schema `app`; policy theo `workspace_id` từ JWT claim |

### 4.4 Môi trường

| Môi trường | Mục đích | Hạ tầng |
|---|---|---|
| `local` | Phát triển | Docker Compose: Postgres 16 + Redis 7; Meta app ở chế độ dev; LLM mock; Meta mock (msw) cho test |
| `staging` | Kiểm thử trước release; **môi trường bắt buộc cho P2 (thực thi ghi)** | Vercel preview + Supabase project riêng + Railway env `staging`; kết nối **tài khoản Meta test** (sandbox ad account) để thử hành động ghi mà không chạm tiền thật |
| `production` | Khách thật | Như sơ đồ 4.1 |

Mỗi môi trường có Meta App ID riêng (dev/staging dùng app ở chế độ phát triển với tài khoản test). Cấu hình hạ tầng lưu trong `infra/` và thay đổi qua PR. **Chỉ PM** có quyền ghi trên dashboard nhà cung cấp ở production; Claude Code chỉ làm việc với `local` và `staging`, không bao giờ nhận secrets production. Khi có dev part-time, cấp cho họ quyền theo vai trò riêng, không dùng chung tài khoản PM.

---

## 5. Cơ sở dữ liệu

### 5.1 Tổ chức schema
- `app`: dữ liệu giao dịch (tenancy, connections, findings, reports, actions, billing).
- `analytics`: snapshot insights theo ngày và cấu trúc tài khoản. Tách schema để sau này có thể chuyển sang kho riêng mà không đổi API.
- Mọi bảng có `workspace_id uuid not null` (trừ `app.users`), `created_at`, `updated_at`.
- Tiền: `numeric(18,4)`; tỷ lệ: `numeric(10,6)`; không dùng `float` cho số liệu quảng cáo.
- Múi giờ: lưu `timestamptz`; ngày của insight là `date` theo múi giờ của ad account.

### 5.2 DDL các bảng cốt lõi (rút gọn)

```sql
-- Tenancy
create table app.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_locale text not null default 'vi',
  default_timezone text not null default 'Asia/Ho_Chi_Minh',
  brand jsonb not null default '{}',           -- {logo_path, primary_color, display_name}
  badge_removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.memberships (
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  user_id uuid not null,                       -- Supabase auth.users.id
  role text not null check (role in ('owner','manager','buyer')),
  client_access uuid[] not null default '{}',  -- rỗng = tất cả Client (owner/manager)
  primary key (workspace_id, user_id)
);

create table app.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  name text not null,
  brand_override jsonb,
  report_locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Connections
create table app.meta_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  created_by uuid not null,
  meta_user_id text not null,
  token_ciphertext bytea not null,             -- AES-256-GCM
  token_key_version int not null,
  scopes text[] not null,                      -- ['ads_read'] | ['ads_read','ads_management']
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','revoked')),
  created_at timestamptz not null default now()
);

create table app.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  connection_id uuid not null references app.meta_connections(id) on delete cascade,
  client_id uuid references app.clients(id),
  meta_account_id text not null,               -- 'act_123'
  name text not null,
  currency char(3) not null,
  timezone text not null,
  assignment_status text not null default 'suggested'
    check (assignment_status in ('suggested','confirmed')),
  sync_status text not null default 'pending',
  last_synced_at timestamptz,
  active_30d boolean not null default false,
  unique (workspace_id, meta_account_id)
);

-- Analytics: cấu trúc tài khoản
create table analytics.entities (
  workspace_id uuid not null,
  ad_account_id uuid not null references app.ad_accounts(id) on delete cascade,
  entity_type text not null check (entity_type in ('campaign','adset','ad','creative')),
  meta_id text not null,
  parent_meta_id text,
  name text,
  status text,
  objective text,
  daily_budget numeric(18,4),
  learning_stage text,
  attrs jsonb not null default '{}',           -- thumbnail_url, format, ...
  updated_at timestamptz not null default now(),
  primary key (ad_account_id, entity_type, meta_id)
);

-- Analytics: snapshot theo ngày
create table analytics.insights_daily (
  workspace_id uuid not null,
  ad_account_id uuid not null references app.ad_accounts(id) on delete cascade,
  entity_type text not null,
  meta_id text not null,
  date date not null,
  spend numeric(18,4) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric(10,6),
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  results bigint not null default 0,           -- theo mục tiêu tối ưu
  result_type text,
  conversion_value numeric(18,4),
  attribution_window text not null,            -- '7d_click_1d_view' ...
  actions jsonb,                               -- mảng actions gốc từ Meta
  fetched_at timestamptz not null default now(),
  primary key (ad_account_id, entity_type, meta_id, date)
);
create index on analytics.insights_daily (ad_account_id, date);

-- Sync & reconciliation
create table app.sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  ad_account_id uuid not null references app.ad_accounts(id) on delete cascade,
  kind text not null check (kind in ('backfill','daily','manual')),
  date_from date not null, date_to date not null,
  status text not null default 'queued',
  rows_written int not null default 0,
  error text,
  started_at timestamptz, finished_at timestamptz
);

create table app.reconciliation_results (
  ad_account_id uuid not null references app.ad_accounts(id) on delete cascade,
  date date not null,
  spend_internal numeric(18,4) not null,
  spend_meta numeric(18,4) not null,
  results_internal bigint not null,
  results_meta bigint not null,
  spend_delta_pct numeric(10,6) not null,
  results_delta_pct numeric(10,6) not null,
  status text not null check (status in ('ok','warning')),
  checked_at timestamptz not null default now(),
  primary key (ad_account_id, date)
);

-- Findings
create table app.findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  ad_account_id uuid not null references app.ad_accounts(id) on delete cascade,
  rule_id text not null,
  entity_type text not null, meta_id text not null,
  severity text not null check (severity in ('low','medium','high')),
  impact_estimate numeric(18,4),
  impact_method text,
  evidence jsonb not null,                     -- {metrics, window, comparison}
  explanation jsonb not null,                  -- {why, what_to_do, deep_link}
  status text not null default 'new' check (status in ('new','seen','done','dismissed')),
  dismiss_reason text,
  snapshot_version text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (ad_account_id, rule_id, entity_type, meta_id, snapshot_version)
);

create table app.finding_feedback (
  id bigserial primary key,
  finding_id uuid not null references app.findings(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('seen','done','dismissed','wrong')),
  note text,
  created_at timestamptz not null default now()
);

-- Reports
create table app.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null references app.clients(id) on delete cascade,
  kind text not null check (kind in ('audit','periodic','pitch')),
  date_from date not null, date_to date not null,
  locale text not null,
  content jsonb not null,                      -- có cấu trúc, mỗi số kèm nguồn
  summary_text text,
  reconciliation_status text not null check (reconciliation_status in ('ok','warning')),
  template_version text not null,
  pdf_path text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table app.share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  report_id uuid not null references app.reports(id) on delete cascade,
  token text not null unique,                  -- 32 byte random, base64url
  show_badge boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table app.report_views (
  id bigserial primary key,
  share_link_id uuid not null references app.share_links(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  ua_hash text
);

-- Execution (P2)
create table app.actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  ad_account_id uuid not null,
  recommendation_id uuid,
  rule_id uuid,                                -- P2b
  action_type text not null,                   -- 'pause_ad' | 'resume_ad' | 'set_budget' | 'duplicate_adset'
  target_meta_id text not null,
  tier text not null check (tier in ('approve','auto')),
  before_state jsonb not null,
  after_state jsonb,
  status text not null default 'pending'
    check (status in ('pending','executing','success','failed','undone')),
  idempotency_key text not null unique,
  approved_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table app.action_logs (                 -- append-only
  id bigserial primary key,
  action_id uuid not null references app.actions(id),
  event text not null,
  detail jsonb not null,
  at timestamptz not null default now()
);
```

Các bảng còn lại (`recommendations`, `report_schedules`, `automation_rules`, `subscriptions`, `rule_configs`, `job_audit`) theo cùng quy ước; định nghĩa trong `packages/db/schema/*.ts`.

### 5.3 Row Level Security
- Bật RLS trên mọi bảng `app.*` và `analytics.*`.
- Policy chuẩn: `workspace_id = (auth.jwt() ->> 'workspace_id')::uuid`.
- API và worker dùng service role (bỏ qua RLS) nhưng **luôn** thêm `where workspace_id = ?` ở tầng ứng dụng; RLS là lớp phòng thủ thứ hai cho truy cập trực tiếp.
- Bảng `app.meta_connections`: không có policy `select` cho vai trò người dùng; chỉ service role đọc.

### 5.4 Mã hóa token
- Thuật toán AES-256-GCM; khóa 32 byte trong biến môi trường `TOKEN_ENC_KEY_V1` (chỉ cấp cho worker và API route OAuth callback).
- `token_key_version` cho phép xoay khóa: thêm `TOKEN_ENC_KEY_V2`, job `rotate_tokens` giải mã bằng V1 và mã hóa lại bằng V2.
- Không bao giờ ghi plaintext token vào log, Sentry breadcrumb hay response.

### 5.5 Lưu trữ và xóa
- Khi ngắt kết nối: xóa `token_ciphertext` ngay (ghi đè bằng `'\x'`), đặt `status='revoked'`; job `purge_connection_data` xóa `analytics.*` và `app.findings` của các tài khoản liên quan sau 7 ngày (cho phép hoàn tác nhầm lẫn).
- Webhook Meta "data deletion request": xử lý như ngắt kết nối với toàn bộ connection của `meta_user_id` tương ứng, trả confirmation code theo yêu cầu của Meta.

---

## 6. Tích hợp Meta Marketing API

### 6.1 Ứng dụng & quyền
| Mục | Giá trị / Việc cần làm |
|---|---|
| Loại app | Business |
| Quyền P0–P1 | `ads_read`, `business_management` (để liệt kê ad account), `email` |
| Quyền P2 | thêm `ads_management` qua luồng OAuth riêng (re-authorize) |
| App Review | Bắt đầu từ V0; cần video demo, chính sách quyền riêng tư, Business Verification |
| Phiên bản API | Dùng phiên bản mới nhất tại thời điểm E4; ghi vào `META_API_VERSION` |
| Token | Đổi short-lived → long-lived user token (60 ngày); làm mới trước hạn bằng job `refresh_tokens`; nếu hết hạn, đặt `status='expired'` và email người kết nối |

### 6.2 `packages/meta-client`
- Wrapper HTTP với: phân trang `paging.cursors`, retry exponential backoff cho mã lỗi 4/17/32/613 (rate limit) và 5xx, đọc header `x-business-use-case-usage` để tự giảm tốc.
- Giới hạn đồng thời theo `ad_account_id` (1 request/lúc) và theo app (cấu hình, mặc định 5).
- Mọi lời gọi ghi `job_audit` (endpoint, account, thời lượng, mã lỗi); không ghi token.

### 6.3 Đồng bộ
| Việc | Endpoint (dạng) | Tham số chính |
|---|---|---|
| Liệt kê ad account | `GET /me/adaccounts` | `fields=id,name,currency,timezone_name,account_status` |
| Cấu trúc | `GET /{act}/campaigns`, `/adsets`, `/ads`, `/adcreatives` | `fields` theo bảng `analytics.entities`; `limit=500` |
| Insights theo ngày | `GET /{act}/insights` | `level=ad`, `time_increment=1`, `time_range`, `fields=spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,action_values`, `action_attribution_windows` |
| Đối chiếu | `GET /{act}/insights` | `level=account`, `time_increment=1`, cùng cửa sổ attribution |

- Backfill: chia 90 ngày thành lô 7 ngày; mỗi lô một job con; cập nhật `sync_runs.rows_written` để UI hiển thị tiến độ.
- Daily sync: chạy lúc 03:00 theo múi giờ ad account; lấy 3 ngày gần nhất (Meta cập nhật muộn) và upsert.
- `results` lấy theo `optimization_goal` của ad set; lưu `result_type` để báo cáo nói đúng tên kết quả.

### 6.4 Đối chiếu (Reconciliation)
```
delta_pct = |internal − meta| / max(meta, ε) × 100
status = 'ok' nếu spend_delta_pct ≤ 1 và results_delta_pct ≤ 1, ngược lại 'warning'
```
- Chạy cho từng ngày trong khoảng vừa sync.
- Nếu `warning`: ghi `reconciliation_results`, gửi cảnh báo nội bộ (Slack/email đội AdxLens), đặt `reports.reconciliation_status='warning'` cho báo cáo chứa ngày đó, chặn tạo share link mới.
- Nguyên nhân lệch thường gặp phải được ghi trong runbook: Meta cập nhật trễ (chạy lại sau 24 h), cửa sổ attribution khác, tài khoản đổi múi giờ.

---

## 7. Worker & Jobs (BullMQ)

### 7.1 Queue
| Queue | Concurrency / worker | Service |
|---|---|---|
| `sync` | 3 (giới hạn thêm theo account) | worker-core |
| `reconcile` | 3 | worker-core |
| `audit` | 2 | worker-core |
| `recommend` | 2 | worker-core |
| `report` | 2 | worker-render |
| `pdf` | 1 (Chromium) | worker-render |
| `notify` | 5 | worker-render |
| `execute` | 1 per account (group key) | worker-core (P2) |
| `rules` | 2 (`evaluate_rules`, `shadow_evaluate_rules`) | worker-core (P2b) |
| `ops` | 2 (`health_check`, `auto_remediate`) | worker-core; luôn chạy, không phụ thuộc cờ |
| `maintenance` | 1 | worker-core |

### 7.2 Quy ước job
- Tên: `<queue>:<verb>` ví dụ `sync:backfill_account`.
- `jobId` = idempotency key theo bảng ở L2 mục 9 (ví dụ `sync:backfill:{account_id}:{from}:{to}`); BullMQ từ chối trùng.
- Retry: 5 lần, backoff mũ từ 30 s; sau lần cuối → `failed` + Sentry + ghi `sync_runs.error`.
- Payload là kiểu trong `packages/jobs` (zod schema), validate khi nhận.
- Repeatable jobs (scheduler): `daily_sync` theo múi giờ từng account, `weekly_digest` thứ Hai 08:00 theo múi giờ workspace, `refresh_tokens` hằng ngày, `recompute_active_30d` hằng ngày.

### 7.3 Chuỗi job P0
```
import_accounts (S04, ADR-0005) → sync:backfill_account (7 ngày/lô)
  → reconcile:account(range)
      → ok: audit:run(account) → report:build(nếu có yêu cầu/lịch) → pdf:render (nếu cần) → notify:*
      → warning: notify:internal_alert
```

### 7.4 Chuỗi job P2a (thực thi có duyệt)
```
POST /recommendations/{id}/approve
  → execute:action(action_id)            [queue `execute`, group key = ad_account_id, concurrency 1]
      1. permission check (scope write, vai trò, kill switch)
      2. guardrails (ngân sách, loại trừ, khung giờ)
      3. ghi actions(status=executing) + action_logs(before)
      4. gọi Meta với idempotency key
      5. verify: đọc lại đối tượng, so với after_expected
      6. success → actions(status=success), action_logs(after); notify:user
         fail    → actions(status=failed), action_logs(error); notify:alert; circuit breaker đếm lỗi
```
Hành động `undo` là một `execute:action` mới với `before_state` của hành động gốc làm mục tiêu, tham chiếu `undo_of`.

---

## 8. Insight Engine: cài đặt

- Mỗi quy tắc là một file `packages/core/insight/rules/<rule_id>.ts` export object `Rule` theo hợp đồng L2 mục 5.1.
- `RuleConfig` đọc từ bảng `app.rule_configs` (ngưỡng theo `rule_id`, có thể ghi đè theo workspace về sau); mặc định trong code.
- Engine đọc snapshot bằng truy vấn tổng hợp SQL (không kéo toàn bộ hàng vào bộ nhớ): cửa sổ so sánh mặc định 7 ngày gần vs 7 ngày trước.
- `snapshot_version = max(fetched_at)` của tài khoản; findings có cùng `(rule, entity, snapshot_version)` được upsert để không trùng.
- Test: mỗi quy tắc có fixture CSV và test kỳ vọng; thêm test "không đủ dữ liệu thì không phát hiện".
- Health score: cấu hình điểm trừ theo severity (high −15, medium −7, low −3), trần mỗi nhóm −30, sàn 0.

---

## 9. Reporting & PDF

- Mẫu báo cáo là React component trong `packages/ui/report/*`, nhận `ReportContent` (JSON) và `locale`.
- Trang công khai `r.adxlens.com/{token}` là route Next.js render server-side, cache 5 phút; kiểm tra `revoked_at`, `expires_at`.
- PDF: worker-render mở trang nội bộ `/print/report/{report_id}?key=<signed>` bằng Playwright (`page.pdf`, A4, print CSS), lưu vào Storage `reports/{workspace}/{report}.pdf`, trả signed URL 1 giờ.
- Tóm tắt LLM:
  - Prompt chứa: danh sách findings (đã rút gọn), số liệu chính, ngôn ngữ, ràng buộc "không đưa con số nào ngoài danh sách".
  - Sau khi sinh: trích mọi số (regex số có dấu phân cách theo locale) và đối chiếu với tập số đầu vào ± làm tròn; nếu có số lạ → sinh lại (tối đa 2 lần) hoặc dùng tóm tắt mẫu không LLM.
  - Model: Claude Sonnet hiện hành; `max_tokens` 600; nhiệt độ thấp.

---

## 10. API chi tiết (OpenAPI 3.1, trích)

Đặc tả đầy đủ sinh từ code bằng `zod-to-openapi` và xuất tại `/api/v1/openapi.json`; Swagger UI tại `/api/docs` (chỉ staging). Dưới đây là các endpoint quan trọng nhất.

### 10.1 Quy ước chung
- Base: `https://app.adxlens.com/api/v1`
- Auth: `Authorization: Bearer <supabase_jwt>`; workspace lấy từ claim hoặc header `X-Workspace-Id` (phải là workspace người dùng thuộc về).
- Lỗi: `{ "error": { "code": "string", "message": "string", "details": {} } }`; mã 400/401/403/404/409/422/429/500.
- Phân trang: `?cursor=&limit=` (mặc định 50, tối đa 200), trả `next_cursor`.
- Rate limit: 600 request/phút/workspace; header `X-RateLimit-Remaining`.
- Idempotency: `Idempotency-Key` header cho POST tạo tài nguyên.

### 10.2 Endpoint

```yaml
openapi: 3.1.0
info: { title: AdxLens API, version: 1.0.0 }
paths:
  /connections/meta/authorize:
    get:
      summary: Bắt đầu OAuth Meta
      parameters:
        - { name: scope, in: query, schema: { enum: [read, write] }, description: "write chỉ từ P2" }
      responses:
        "302": { description: Redirect tới Meta }

  /ad-accounts/import:
    post:
      summary: Chọn tài khoản và nhận gợi ý Client
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [connection_id, meta_account_ids]
              properties:
                connection_id: { type: string, format: uuid }
                meta_account_ids: { type: array, items: { type: string } }
      responses:
        "200":
          content:
            application/json:
              example:
                items:
                  - ad_account_id: "4d3e..."
                    meta_account_id: "act_123"
                    name: "ABC Shop - Main"
                    currency: "VND"
                    timezone: "Asia/Ho_Chi_Minh"
                    suggested_client: { id: null, name: "ABC Shop" }
                    assignment_status: "suggested"

  /ad-accounts/{id}/assign:
    post:
      summary: Gán Client và xác nhận
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [client_id]
              properties:
                client_id: { type: string, format: uuid }
                create_client_name: { type: string, description: "Tạo Client mới nếu client_id null" }
      responses:
        "200": { description: "assignment_status = confirmed; backfill được enqueue" }
        "409": { description: "Tài khoản đã thuộc Client khác, cần bỏ gán trước" }

  /ad-accounts/{id}/sync-status:
    get:
      responses:
        "200":
          content:
            application/json:
              example:
                status: "running"
                progress: { days_done: 42, days_total: 90 }
                last_synced_at: "2026-10-22T03:12:40+07:00"
                reconciliation: { status: "ok", last_checked_at: "2026-10-22T03:14:02+07:00" }

  /ad-accounts/{id}/findings:
    get:
      parameters:
        - { name: severity, in: query, schema: { enum: [low, medium, high] } }
        - { name: group, in: query, schema: { type: string } }
        - { name: status, in: query, schema: { enum: [new, seen, done, dismissed] } }
        - { name: cursor, in: query }
        - { name: limit, in: query }
      responses:
        "200":
          content:
            application/json:
              example:
                items:
                  - id: "f1..."
                    rule_id: "creative_fatigue"
                    entity: { type: "ad", meta_id: "2384...", name: "Video A - Tết" }
                    severity: "high"
                    impact_estimate: { amount: 2850000, currency: "VND", method: "Spend 7 ngày × (1 − CTR_hiện_tại/CTR_7_ngày_trước)" }
                    evidence:
                      window: { current: ["2026-10-15","2026-10-21"], baseline: ["2026-10-08","2026-10-14"] }
                      metrics: { frequency: [2.1, 3.4], ctr: [0.018, 0.009], roas: [3.2, 1.6] }
                    explanation:
                      why: "Tần suất tăng 62% trong khi CTR giảm 50%."
                      what_to_do: "Thay creative mới hoặc giảm ngân sách ad này."
                      deep_link: "https://adsmanager.facebook.com/adsmanager/manage/ads?act=123&selected_ad_ids=2384..."
                    status: "new"
                next_cursor: null

  /findings/{id}/feedback:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [kind]
              properties:
                kind: { enum: [seen, done, dismissed, wrong] }
                note: { type: string }
      responses: { "204": { description: OK } }

  /reports:
    post:
      summary: Tạo báo cáo (bất đồng bộ)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [client_id, kind, date_from, date_to]
              properties:
                client_id: { type: string, format: uuid }
                kind: { enum: [audit, periodic, pitch] }
                date_from: { type: string, format: date }
                date_to: { type: string, format: date }
                locale: { enum: [vi, en] }
      responses:
        "202":
          content:
            application/json:
              example: { report_id: "r1...", status: "building" }
        "422":
          description: "Có ad account chưa confirmed hoặc reconciliation warning"
          content:
            application/json:
              example: { error: { code: "REPORT_BLOCKED", message: "Account act_123 reconciliation warning on 2026-10-20", details: { blocked_accounts: ["act_123"] } } }

  /reports/{id}/share-links:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                expires_in_days: { type: integer, minimum: 1, maximum: 365 }
      responses:
        "201":
          content:
            application/json:
              example:
                id: "s1..."
                url: "https://r.adxlens.com/9Xk...Qw"
                show_badge: true
                expires_at: "2026-11-21T00:00:00Z"
        "409": { description: "Report chưa sẵn sàng hoặc bị chặn" }

  /reports/{id}/pdf:
    post:
      responses:
        "202": { description: "Enqueue render; poll GET /reports/{id} tới khi pdf_url có" }

  /recommendations/{id}/approve:   # P2
    post:
      summary: Duyệt 1 click
      responses:
        "202":
          content:
            application/json:
              example: { action_id: "a1...", status: "pending", before: { status: "ACTIVE" }, after_expected: { status: "PAUSED" } }
        "403": { description: "Không có quyền write / vai trò / kill switch đang bật" }
        "422": { description: "Vi phạm guardrails" }

  /webhooks/meta:
    post:
      summary: Deauthorize & data deletion
      description: Xác minh X-Hub-Signature-256; trả { url, confirmation_code } cho data deletion.
```

---

## 11. Bảo mật kỹ thuật

| Chủ đề | Biện pháp |
|---|---|
| Vận chuyển | TLS mọi kết nối; HSTS; CSP nghiêm trên dashboard; trang công khai tách tên miền `r.adxlens.com` |
| Xác thực | Supabase Auth; JWT ngắn hạn + refresh; bắt buộc xác minh email |
| Token chia sẻ | 32 byte ngẫu nhiên (crypto), base64url; so sánh hằng thời gian; không log token |
| Bí mật | Biến môi trường theo môi trường; không commit; quét bí mật trong CI |
| Phụ thuộc | Dependabot; `pnpm audit` trong CI |
| Đầu vào | Zod validate mọi request body và job payload |
| Log | Pino JSON; redact `authorization`, `token`, `access_token`, `email` khi không cần |
| Sao lưu | Supabase PITR 7 ngày; xuất dump hằng tuần sang bucket riêng (mã hóa) |
| Khôi phục | Runbook: khôi phục DB từ PITR; Redis chỉ là queue, mất thì chạy lại job theo `sync_runs` |

---

## 12. Quan sát & vận hành

| Mục | Công cụ | Cảnh báo |
|---|---|---|
| Lỗi ứng dụng | Sentry (web, worker) | Mọi lỗi mới ở production → Slack |
| Log | Pino → Axiom/Better Stack | Truy vấn theo `workspace_id`, `job_id` |
| Queue | Bull Board (`/admin/queues`, chỉ nội bộ) + metric backlog | Backlog `sync` > 100 hoặc job `failed` > 5/giờ → Slack |
| Đối chiếu | Bảng `reconciliation_results` | Bất kỳ `warning` mới → Slack kênh `#data-alerts` (ưu tiên cao nhất) |
| Meta API | `job_audit` | Tỷ lệ 429/613 > 10% trong 15 phút → giảm concurrency tự động + Slack |
| Thực thi (P2) | `actions.status`, `action_logs` | Bất kỳ `failed` → Slack ngay; 3 lỗi liên tiếp/account → circuit breaker |
| Sức khỏe dịch vụ | Better Stack uptime: `app.adxlens.com/api/health`, `r.adxlens.com/health` | Downtime > 2 phút → SMS/Slack |
| Sản phẩm | PostHog | Phễu theo PRD 7.7 |

**Status page** (P2): Better Stack status page công khai tại `status.adxlens.com`.

### 12.1 Trực sự cố và SLA nội bộ

| Mức | Ví dụ | Ai nhận | Thời gian phản hồi mục tiêu |
|---|---|---|---|
| **P1** | Thực thi ghi lên Meta thất bại hoặc sai (P2); lộ dữ liệu giữa Client; dashboard/trang báo cáo sập | **Hệ thống tự hành động trước** (circuit breaker, kill switch, rollback), sau đó gọi PM qua SMS/cuộc gọi | Hệ thống: tức thì. PM: 30 phút trong giờ thức; ngoài giờ, hệ thống giữ trạng thái an toàn cho tới khi PM xử lý |
| **P2** | `reconciliation warning` còn sau lần chạy lại; backfill thất bại nhiều tài khoản; token hết hạn hàng loạt | Playbook tự chạy trước; PM nhận Slack nếu playbook không giải quyết | 4 giờ trong giờ làm việc |
| **P3** | Lỗi UI, email chậm, PDF lỗi lẻ | Marketing ghi nhận; agent chẩn đoán mở issue/PR; PM duyệt | 2 ngày làm việc |

- Vì chỉ có một người trực, nguyên tắc là **"an toàn trước, sửa sau"**: với P1, hệ thống luôn tự đưa về trạng thái an toàn (dừng thực thi, chặn chia sẻ báo cáo, rollback) mà không chờ người.
- Kill switch toàn cục bật được bởi PM hoặc marketing qua trang `apps/web/admin`, và qua một lệnh CLI dự phòng khi web sập.
- Khi PM vắng (nghỉ phép, đi xa): bật sẵn kill switch cho P2b; cân nhắc tắt `p2a_approve` cho các workspace mới.
- Mọi sự cố P1 có postmortem ngắn (nguyên nhân, thời gian phát hiện, việc sửa) trong `docs/runbooks/incidents/`.

---

## 13. CI/CD

```mermaid
flowchart LR
    PR[Pull request] --> CI[GitHub Actions:<br/>lint · typecheck · unit test ·<br/>rule fixture tests · drizzle check]
    CI --> PREV[Vercel Preview +<br/>Railway PR env]
    PREV --> REV[Review]
    REV --> MERGE[Merge main]
    MERGE --> MIG[Migration:<br/>drizzle-kit migrate<br/>trên staging rồi production]
    MIG --> DEPLOY[Vercel production +<br/>Railway deploy worker]
    DEPLOY --> SMOKE[Smoke test:<br/>/api/health, tạo report demo]
```

- Migration chạy trước deploy; mọi migration phải tương thích ngược một phiên bản (thêm cột nullable trước, xóa cột sau).
- Cờ tính năng phát hành (`p0_reports`, `p1_recommendations`, `p2a_approve`, `p2b_auto`) **tự xây trong DB** (mục 18), không dùng PostHog flags, vì đây là cơ chế an toàn cần kiểm tra phía server và có nhật ký. PostHog flags chỉ dùng cho thử nghiệm giao diện.

### 13.1 Quy tắc merge (branch protection trên `main`)
Khi người viết và người review đầu tiên đều là AI, chất lượng dựa vào **ba lớp độc lập**: CI tự động, một phiên Claude Code review không thấy quá trình viết, và PM duyệt ở các vùng bảo vệ.

| Lớp | Áp dụng | Nội dung |
|---|---|---|
| **1. CI (cổng cứng)** | Mọi PR | Lint, typecheck `strict`, unit test, test fixture của mọi rule, test đối chiếu, test cách ly workspace (mục 14), `drizzle-kit check`, quét bí mật, coverage không giảm |
| **2. Review độc lập** | Mọi PR | Một phiên Claude Code mới, chỉ nhận diff + `CLAUDE.md` + mô tả PR, không nhận lịch sử phiên viết. Checklist bắt buộc: có `workspace_id` ở mọi truy vấn; không log token; không nới ngưỡng; test có thật sự kiểm tra hành vi; không sửa test để code qua. Kết quả ghi thành comment trên PR |
| **3. PM duyệt** | `packages/core`, `packages/db`, `apps/worker`, `infra` (theo `CODEOWNERS`) | PM đọc mô tả PR, kết quả review độc lập, và chạy thử trên preview/staging khi chạm luồng chính |

Quy tắc bổ sung:
- **Ngưỡng coverage:** `packages/core` ≥ 80% dòng; `packages/core/execution` ≥ 90%; không giảm so với `main`.
- **Test và code đổi cùng PR** phải ghi rõ trong mô tả lý do đổi test; review độc lập kiểm tra test cũ có bị nới không.
- **PR nhỏ:** tối đa khoảng 400 dòng thay đổi (trừ code sinh tự động); lớn hơn thì tách.
- **Vùng bảo vệ cao nhất** (`packages/core/execution`, migration, RLS): ngoài 3 lớp trên, PM phải chạy test tích hợp trên staging với tài khoản Meta test trước khi merge.
- Deploy production: tự động sau merge cho `apps/web`; `apps/worker` và migration cần PM bấm xác nhận trong GitHub Actions (environment protection).

---

## 14. Kiểm thử

| Lớp | Cách |
|---|---|
| Quy tắc audit | Fixture CSV + kỳ vọng; test "không đủ dữ liệu" bắt buộc cho mỗi rule |
| Đối chiếu | Test với số liệu giả có lệch 0.5% / 1.5% |
| Meta client | Mock HTTP (msw); test rate limit và phân trang |
| Reporting | Snapshot test JSON `ReportContent`; test kiểm tra số trong tóm tắt LLM với output giả |
| API | Test tích hợp trên Postgres local (Docker) |
| E2E | Playwright: kết nối (mock OAuth), xác nhận Client, tạo report, mở link công khai |
| P2 | Test guardrails và verifier với Meta mock; test circuit breaker; **test tích hợp trên staging với tài khoản Meta test** cho từng `action_type` trước khi bật cờ cho khách; kịch bản bắt buộc: Meta trả lỗi giữa chừng, verify không khớp, retry trùng (idempotency), undo |
| Hợp đồng Meta API | Test contract định kỳ (hằng tuần) gọi Meta thật trên tài khoản test để phát hiện API đổi field; lỗi tự mở issue cho agent chẩn đoán và báo PM |
| Cách ly workspace | Test bắt buộc trong CI: tạo 2 workspace với dữ liệu giả, gọi mọi endpoint và job bằng ngữ cảnh workspace A, khẳng định không trả về hoặc ghi đè dữ liệu của workspace B. Thêm endpoint mới mà không thêm vào bộ test này thì CI đỏ |
| Cờ tính năng | Mỗi API, job và trang của P1/P2 có test "cờ tắt thì không chạy / trả 404" |

---

## 15. Chi phí ước tính giai đoạn đầu (tham khảo, kiểm tra lại bảng giá)

| Dịch vụ | Gói | Ước tính/tháng (USD) |
|---|---|---|
| Vercel Pro | 1 seat | ~20 |
| Supabase Pro | Small | ~25 + compute |
| Railway | 2–3 service nhỏ | ~20–40 |
| Upstash Redis | Pay-as-you-go | ~5–15 |
| Resend | Theo lượng | ~0–20 |
| Anthropic API | Theo token (~1 tóm tắt/báo cáo) | ~5–30 |
| Sentry, PostHog, Better Stack | Free/hobby tier ban đầu | ~0 |
| **Tổng** | | **~80–150** |

Chi phí tăng chủ yếu theo số tài khoản ads (dung lượng `insights_daily`) và số báo cáo (LLM, PDF). Cộng thêm chi phí Claude Code (gói đăng ký hoặc API, tùy cách dùng; kiểm tra giá hiện hành) và, sau khi có khách, chi phí dev part-time. Chi phí hạ tầng không đổi vì vẫn dùng PaaS.

---

## 16. Rủi ro kỹ thuật & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Meta rate limit làm backfill chậm, không đạt 10 phút | Ưu tiên lấy 30 ngày gần nhất trước, hiển thị báo cáo một phần, backfill 60 ngày còn lại nền; hiển thị tiến độ |
| Meta đổi API/phiên bản | `META_API_VERSION` cấu hình; adapter riêng trong `meta-client`; test contract |
| `insights_daily` phình to | Partition theo tháng khi > 50 triệu hàng; lưu `actions` jsonb nén |
| Serverless timeout trên Vercel | Mọi việc > 10 s đi qua queue; API chỉ enqueue và trả 202 |
| Chromium trong worker nặng | Service `worker-render` riêng; concurrency 1; cache font |
| LLM sinh số sai | Bộ kiểm tra số bắt buộc; fallback tóm tắt mẫu |
| Mất Redis | Queue được tạo lại từ `sync_runs`/`reports` ở trạng thái `queued`; job idempotent |
| Lộ dữ liệu giữa Client do gán sai | Ràng buộc `assignment_status='confirmed'` ở tầng DB (trigger từ chối tạo share link) và tầng API |
| AI viết và AI review cùng bỏ sót một loại lỗi | CI là cổng cứng (test cách ly workspace, đối chiếu, guardrails); review độc lập không thấy phiên viết; PM duyệt vùng bảo vệ; khuyến nghị review bên ngoài trước khi bật `p2a_approve` |
| AI "sửa" bằng cách nới test hoặc ngưỡng | Quy tắc trong `CLAUDE.md`; review độc lập kiểm tra riêng; ngưỡng đối chiếu và guardrails là hằng số có test khóa giá trị |
| Prompt injection qua log, tên campaign, nội dung từ Meta | Agent chẩn đoán không có quyền production; log được che; PR luôn qua CI và review; agent không tự merge vùng bảo vệ |
| PM là người kỹ thuật duy nhất: quá tải review, vắng mặt khi có sự cố | Tự khắc phục mức 2; "an toàn trước, sửa sau"; giới hạn số PR vùng bảo vệ mỗi tuần; thuê dev part-time khi có khách trả phí |
| Codebase lớn do AI viết, khó bàn giao | `CLAUDE.md`, ADR, `docs/onboarding.md`, `docs/tech-debt.md`; PR nhỏ; coverage cao (mục 20) |
| Xây P0 → P2b trước khi kiểm chứng nhu cầu | Cờ tính năng; kết quả V0 quyết định bật hay sửa; P3 không xây |

---

## 17. Kế hoạch xây theo module (một lượt, P0 → P2b)

Claude Code xây theo thứ tự phụ thuộc dưới đây; mỗi mốc là một nhóm PR nhỏ. Thứ tự ưu tiên là để **B0–B3 xong trước cuối V0** (khoảng tuần 3), vì E1 cần engine thật để chạy audit concierge. Thời gian thực tế phụ thuộc chủ yếu vào tốc độ PM review và duyệt, không phải tốc độ viết code.

| Mốc | Nội dung | Phụ thuộc | Định nghĩa xong |
|---|---|---|---|
| **B0. Nền móng** | Monorepo, `CLAUDE.md`, CI đầy đủ (mục 13.1), Docker Compose, schema DB lõi + RLS, M1 tenancy, M11 flags (bảng + kiểm tra phía server), khung M12 ops (health check, incident), test cách ly workspace | — | CI xanh; test cách ly chạy với 2 workspace giả; tạo workspace và mời thành viên được trên local |
| **B1. Kết nối, đồng bộ, đối chiếu** | `meta-client`, OAuth đọc, import + assign (confirmed), backfill theo lô, daily sync, reconciliation, playbook `meta_rate_limited`, `reconcile_retry`, `token_expiring` | B0 | **= E4**: chạy trên 3 tài khoản thật của design partner; báo cáo độ lệch và danh sách rule có dữ liệu |
| **B2. Insight engine** | 9 rule theo fixture PM định nghĩa, health score, findings + feedback, deep link Ads Manager | B1 | Mọi rule có test fixture và test "không đủ dữ liệu"; chạy trên dữ liệu E4 |
| **B3. Báo cáo & chia sẻ** | `ReportContent`, mẫu vi/en, thương hiệu, tóm tắt LLM + bộ kiểm tra số, share link, trang công khai, PDF, nhãn "Powered by", chặn chia sẻ khi chưa confirmed hoặc đang lệch | B2 | Báo cáo thật cho 1 design partner xuất được web + PDF; số trong tóm tắt khớp 100% |
| **B4. Thông báo & lịch** | Digest tuần, lịch gửi báo cáo, cảnh báo nội bộ, trang demo tài khoản mẫu | B3 | Digest gửi thử trên staging theo múi giờ workspace |
| **B5. P1: gợi ý & creative** | Creative library, phân loại creative, Weekly Action List, đo trước/sau, onboarding media buyer; tất cả sau cờ `p1_recommendations` | B2 | Test "cờ tắt thì không chạy"; Action List tạo đúng giờ |
| **B6. Billing** | Gói theo tài khoản active 30 ngày, Stripe + cổng VN, webhook, quyền theo gói (gỡ nhãn) | B0 | Thanh toán thử trên môi trường test của cổng thanh toán |
| **B7. P2a: duyệt 1 click** | OAuth nâng quyền ghi, Execution Gateway (permission, guardrails, executor, verifier, action log, undo, circuit breaker, kill switch), playbook `execution_failed`; sau cờ `p2a_approve` | B5 | Mọi `action_type` chạy thành công trên staging với tài khoản Meta test, kể cả kịch bản lỗi (mục 14); coverage `execution` ≥ 90% |
| **B8. P2b: tự chạy có phanh** | Rule builder + mẫu, backtest trên snapshot, shadow mode, `evaluate_rules`; sau cờ `p2b_auto` | B7 | Shadow mode chạy ≥ 14 ngày trên staging; backtest khớp kỳ vọng fixture |
| **B9. Vận hành & bàn giao** | Hoàn thiện playbook (mục 19), agent chẩn đoán, runbook, `docs/onboarding.md`, E2E Playwright, kiểm thử tải backfill | Tất cả | Diễn tập 3 sự cố giả (Meta rate limit, đối chiếu lệch, thực thi lỗi) xử lý đúng playbook |

### 17.1 Việc của PM và marketing chạy song song với lượt xây

| Tuần | PM | Marketing |
|---|---|---|
| 0–1 | Tạo Meta App (Business), nộp App Review `ads_read`; tạo tài khoản nhà cung cấp và secrets production; viết fixture và ngưỡng cho 9 rule; duyệt B0 | Chốt 3–5 agency; lên lịch 10 phỏng vấn E3; trang đích E2 |
| 1–3 | Duyệt B1–B3; chạy E4 cùng Claude Code; quyết định rule nào giữ | E3; E1 với kết quả engine + kiểm tay |
| Cuối tuần 3 | Quyết định bật `p0_reports` cho design partner (mục 18.3) | Thu phản hồi E1 |
| Sau P0 | Duyệt B5–B9; nộp App Review `ads_management` khi B7 xong | GTM P0 |

### 17.2 Trước khi bật `p2a_approve` cho khách đầu tiên
- [ ] Meta đã duyệt `ads_management`.
- [ ] Mọi `action_type` đã chạy trên staging với tài khoản Meta test, kể cả lỗi giữa chừng, verify không khớp, retry trùng, undo.
- [ ] Coverage `packages/core/execution` ≥ 90%.
- [ ] Kill switch, circuit breaker, action log đã thử trên staging; kill switch CLI dự phòng hoạt động.
- [ ] Guardrails mặc định thận trọng: trần thay đổi ngân sách thấp, giới hạn số hành động/ngày.
- [ ] **Khuyến nghị:** một người kỹ thuật bên ngoài review `packages/core/execution` (thuê theo giờ).
- [ ] Bắt đầu với 1–2 agency thân thiết.

---

## 18. Cờ tính năng & phát hành

### 18.1 Cài đặt

```sql
create table app.feature_flags (
  workspace_id uuid not null references app.workspaces(id) on delete cascade,
  flag_key text not null check (flag_key in ('p0_reports','p1_recommendations','p2a_approve','p2b_auto')),
  enabled boolean not null default false,
  enabled_by uuid,
  enabled_at timestamptz,
  reason text,
  primary key (workspace_id, flag_key)
);

create table app.flag_change_log (            -- append-only
  id bigserial primary key,
  workspace_id uuid not null,
  flag_key text not null,
  old_value boolean not null,
  new_value boolean not null,
  changed_by uuid not null,
  reason text not null,
  checklist_result jsonb not null,            -- kết quả checklist kỹ thuật tại thời điểm đổi
  override boolean not null default false,    -- PM bật dù checklist chưa đạt
  at timestamptz not null default now()
);
```

- `packages/core/flags` cung cấp `isEnabled(workspaceId, flagKey)`; cache 60 giây trong Redis, xóa cache ngay khi đổi.
- **Phụ thuộc giữa cờ:** `p1_recommendations` cần `p0_reports`; `p2a_approve` cần `p1_recommendations`; `p2b_auto` cần `p2a_approve`. Tắt một cờ sẽ tắt luôn các cờ phụ thuộc.
- Kiểm tra cờ ở **ba chỗ**: route API, job worker (kiểm tra lại khi job bắt đầu chạy), và UI. API và job là bắt buộc; UI chỉ để ẩn.
- Tắt cờ không xóa dữ liệu; job đang chạy của tính năng đó dừng ở bước kiểm tra tiếp theo. Tắt `p2a_approve` hoặc `p2b_auto` hủy các action đang `pending`.

### 18.2 Quyền
- Vai trò `staff` (đội AdxLens), tách khỏi vai trò của agency. Chỉ người có `staff.can_enable_flags = true` (PM) bật được cờ; mọi `staff` tắt được.
- Trang `apps/web/admin/flags`: danh sách workspace × cờ, kết quả checklist kỹ thuật, nút bật/tắt bắt buộc nhập lý do.

### 18.3 Checklist kỹ thuật tự động

Khi PM bấm bật, hệ thống tự chạy các kiểm tra dưới đây. Nếu chưa đạt, nút bật bị chặn; PM có thể vượt qua bằng cách ghi lý do (`override = true`), và việc này được ghi lại.

| Cờ | Kiểm tra tự động |
|---|---|
| `p0_reports` | Mọi ad account của workspace đã `confirmed`; đối chiếu 7 ngày gần nhất `ok`; không có incident P1 mở |
| `p1_recommendations` | `p0_reports` đã bật ≥ 14 ngày; tỷ lệ finding "sai" của workspace ≤ 20% |
| `p2a_approve` | Connection có scope `ads_management`; test staging của bản deploy hiện tại đạt cho mọi `action_type`; kill switch toàn cục đang tắt; guardrails của workspace đã cấu hình |
| `p2b_auto` | `p2a_approve` đã bật ≥ 8 tuần, tỷ lệ undo ≤ 5%, 0 incident P1 liên quan thực thi; mọi rule của workspace đã chạy shadow ≥ 14 ngày |

### 18.4 P2b: cài đặt rule engine

```sql
create table app.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  ad_account_id uuid not null references app.ad_accounts(id) on delete cascade,
  name text not null,
  template_key text,                          -- mẫu dựng sẵn từ gợi ý P1
  condition jsonb not null,                   -- cây điều kiện đã validate bằng zod
  action jsonb not null,                      -- {type, params}
  guardrails jsonb not null,                  -- {max_budget_change_pct, max_actions_per_day, exclude_ids, hours, min_data}
  mode text not null default 'shadow' check (mode in ('shadow','live','paused')),
  shadow_started_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table app.rule_evaluations (           -- kết quả mỗi lần đánh giá, cả shadow và live
  id bigserial primary key,
  rule_id uuid not null references app.automation_rules(id) on delete cascade,
  evaluated_at timestamptz not null default now(),
  matched_entities jsonb not null,
  would_do jsonb not null,                    -- shadow: hành động lẽ ra sẽ làm
  action_ids uuid[],                          -- live: các action đã tạo
  blocked_by_guardrail text
);
```

- `evaluate_rules` chạy mỗi 30 phút cho rule `live`, `shadow_evaluate_rules` cho rule `shadow`; cả hai đọc từ snapshot, không gọi Meta.
- Rule `live` tạo `actions` với `tier = 'auto'` và đi qua đúng Execution Gateway như P2a.
- Backtest: chạy `condition` trên snapshot 30 ngày, trả danh sách "sẽ làm gì vào ngày nào".
- Rule chỉ chuyển sang `live` khi đã ở `shadow` ≥ 14 ngày và `p2b_auto` đang bật.

---

## 19. Vận hành tự động & quyền của agent

### 19.1 Cài đặt bốn mức (theo L2 mục 11)

| Mức | Cài đặt |
|---|---|
| **1. Phát hiện** | Sentry (lỗi), Better Stack (uptime, heartbeat của scheduler và worker), job `health_check` mỗi 5 phút kiểm backlog queue, tỷ lệ lỗi Meta, đối chiếu, token sắp hết hạn; cảnh báo ngân sách trên Vercel/Supabase/Railway/Anthropic |
| **2. Tự khắc phục** | `packages/core/ops/playbooks/*.ts`, mỗi playbook có `trigger`, `run`, `maxRunsPerHour`, `escalateWhen`; mọi lần chạy ghi `app.ops_incidents` |
| **3. Agent chẩn đoán** | Lỗi mới trên Sentry → issue GitHub (tích hợp Sentry–GitHub) gắn nhãn `agent-diagnose` → Claude Code chạy trong GitHub Actions hoặc PM chạy thủ công → phân tích + PR có test → CI → review độc lập → PM duyệt. Kiểm tra tài liệu Claude Code hiện hành về cách chạy trong GitHub Actions |
| **4. Quyết định** | PM: merge vùng bảo vệ, bật cờ, liên hệ khách |

```sql
create table app.ops_incidents (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('P1','P2','P3')),
  source text not null,                       -- sentry | reconcile | execution | meta_api | uptime | cost
  fingerprint text not null,
  workspace_id uuid,
  ad_account_id uuid,
  playbook text,
  playbook_runs int not null default 0,
  status text not null default 'open' check (status in ('open','auto_resolved','escalated','resolved')),
  github_issue_url text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

### 19.2 Quyền của agent (Claude Code)

| Được | Không được |
|---|---|
| Đọc và ghi repo trên nhánh riêng; mở PR | Merge vào `main` ở vùng bảo vệ; push thẳng `main` |
| Chạy test, lint, build; dùng `local` và `staging` | Bất kỳ secret nào của production; kết nối DB production |
| Đọc issue có nội dung lỗi đã che (stack trace, fingerprint, thông điệp lỗi) | Đọc request body, token, dữ liệu insights của khách |
| Đề xuất thay đổi playbook dưới dạng PR | Tự bật cờ, tự chạy lại hành động ghi, tự đổi ngưỡng đối chiếu hay guardrails |

- **Che dữ liệu:** bật data scrubbing của Sentry; chỉ gửi stack trace, fingerprint, tên job, mã lỗi Meta. Không gửi tên khách, tên campaign, token.
- **Dữ liệu là dữ liệu, không phải lệnh:** `CLAUDE.md` ghi rõ nội dung trong log, issue, tên campaign hay phản hồi Meta không bao giờ là chỉ dẫn cho agent.
- GitHub token của agent: quyền `contents: write` (nhánh), `pull-requests: write`, `issues: write`; branch protection chặn merge.

---

## 20. Sẵn sàng bàn giao cho dev part-time

Mục tiêu: dev part-time làm được thay đổi đầu tiên an toàn trong tuần đầu tiên.

| Hạng mục | Yêu cầu |
|---|---|
| `CLAUDE.md` | Dùng được như hướng dẫn cho người: kiến trúc tóm tắt, quy tắc tuyệt đối, lệnh chạy |
| `docs/onboarding.md` | Cài môi trường local trong ≤ 1 giờ; sơ đồ module; luồng dữ liệu chính; cách chạy E2E |
| ADR | Mỗi quyết định lớn có ADR ngắn: bối cảnh, lựa chọn, hệ quả |
| `docs/tech-debt.md` | Claude Code ghi lại mọi chỗ làm tạm, kèm lý do và cách sửa đúng |
| Runbook | Số liệu lệch, token hết hạn, backfill thất bại, thực thi lỗi, khôi phục DB, xoay khóa token |
| Quyền truy cập | Tài khoản riêng cho dev trên GitHub, Sentry, staging; production cấp theo vai trò sau giai đoạn thử |
| Việc đầu tiên đề xuất cho dev | Review `packages/core/execution` và test cách ly workspace; đọc `docs/tech-debt.md` và ưu tiên lại |
| Sau khi có dev | Cập nhật `CODEOWNERS`: dev duyệt `core`/`db`/`worker`; PM chỉ còn duyệt `execution` và `infra` cùng dev |
