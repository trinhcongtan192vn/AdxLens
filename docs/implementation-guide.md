# AdxLens — Hướng dẫn triển khai (chạy local)

| | |
|---|---|
| **Phiên bản** | 0.1 |
| **Ngày** | 22/10/2026 |
| **Người làm** | PM, dùng VS Code + Claude Code extension trên repo local |
| **Tài liệu nguồn** | PRD v0.4; L1 v0.2; L2 v0.2; L3 v0.3; `CLAUDE.md` |
| **Mục tiêu** | Chạy được trên máy local: landing page → đăng ký → đăng nhập → app vận hành (kết nối Meta, audit, báo cáo, chia sẻ) → thanh toán đầy đủ (test mode) → P1, P2a, P2b sau cờ tính năng |

> **Giả định:** máy Windows dùng WSL2 (Ubuntu). Trên macOS các bước tương tự, bỏ phần WSL. Phiên bản công cụ và giao diện của Meta, Stripe, cổng thanh toán VN có thể thay đổi; khi một bước không khớp với màn hình bạn thấy, làm theo tài liệu chính thức của dịch vụ đó và bảo Claude Code cập nhật hướng dẫn này.

---

## Bản đồ các bước

```
Phần 0  Chuẩn bị máy & tài khoản            (PM, ~1 ngày)
Phần 1  Khởi tạo repo + tài liệu             (PM + Claude Code, ~nửa ngày)
Phần 2  Cách làm việc với Claude Code        (đọc 1 lần, dùng suốt)
Phần 3  Xây theo mốc B0 → B9 + L (landing)   (lượt xây chính)
Phần 4  Kiểm thử đầu-cuối trên local          (checklist)
Phần 5  Xử lý sự cố thường gặp
Phần 6  Sau khi chạy local: bước tiếp theo
```

---

## Phần 0. Chuẩn bị máy & tài khoản

### 0.1 Cài trên máy

| # | Công cụ | Cách cài | Kiểm tra |
|---|---|---|---|
| 1 | **WSL2 + Ubuntu** | PowerShell (Admin): `wsl --install -d Ubuntu`, khởi động lại máy | `wsl -l -v` thấy Ubuntu, VERSION 2 |
| 2 | **Docker Desktop** | Tải từ docker.com; Settings → Resources → WSL Integration → bật cho Ubuntu | Trong Ubuntu: `docker ps` không lỗi |
| 3 | **VS Code** + extension **WSL** và **Claude Code** | Extensions (`Ctrl+Shift+X`) → tìm "WSL", "Claude Code" | Command Palette (`Ctrl+Shift+P`) → "Claude Code: Open in New Tab" mở được |
| 4 | **Git** | Trong Ubuntu: `sudo apt update && sudo apt install -y git` | `git --version` |
| 5 | **Node.js 22 LTS** qua nvm | `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh \| bash`, mở lại terminal, `nvm install 22` | `node -v` ra v22.x |
| 6 | **pnpm** | `corepack enable && corepack prepare pnpm@latest --activate` | `pnpm -v` |
| 7 | **Supabase CLI** | Theo hướng dẫn chính thức của Supabase cho Linux | `supabase --version` |
| 8 | **Stripe CLI** | Theo hướng dẫn chính thức của Stripe cho Linux | `stripe --version` |
| 9 | **GitHub CLI** (tùy chọn) | `sudo apt install gh` | `gh auth status` |
| 10 | **cloudflared** (tunnel, khi cần URL công khai) | Theo hướng dẫn của Cloudflare | `cloudflared --version` |

**Quan trọng:** mở VS Code **bên trong WSL** (trong Ubuntu gõ `code .` tại thư mục repo). Docker, Supabase và Node chạy nhanh và ổn định hơn nhiều khi repo nằm trong ổ của WSL (`~/projects/adxlens`), không nằm ở `C:\`.

Claude Code extension cần một tài khoản Claude trả phí hoặc tài khoản Claude Console. Lần đầu mở, extension sẽ yêu cầu đăng nhập.

### 0.2 Tài khoản dịch vụ (chỉ test mode, chưa tốn tiền)

| Dịch vụ | Cần cho local? | Việc cần làm | Ghi lại vào |
|---|---|---|---|
| **GitHub** | Có | Tạo repo **private** `adxlens` | — |
| **Meta for Developers** | Có | Tạo app loại **Business**; thêm sản phẩm Facebook Login và Marketing API; để app ở **chế độ phát triển**; thêm chính bạn và tài khoản của design partner làm tester/developer; tạo hoặc chuẩn bị **tài khoản quảng cáo test/sandbox** cho P2 | `META_APP_ID`, `META_APP_SECRET` |
| **Stripe** | Có | Tạo tài khoản, bật **Test mode**; tạo Product "AdxLens" với các Price theo bậc (giá tạm) | `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_PUBLISHABLE_KEY` |
| **Cổng thanh toán VN** (ví dụ PayOS) | Có, nếu muốn test VN | Đăng ký tài khoản sandbox/test | Client ID, API key, checksum key |
| **Anthropic Console** | Có (tóm tắt LLM) | Tạo API key riêng cho ứng dụng, đặt giới hạn chi tiêu thấp | `ANTHROPIC_API_KEY` |
| **Sentry** | Không bắt buộc ở local | Có thể để sau | — |
| Supabase cloud, Vercel, Railway, Upstash, Resend | **Không** — local dùng Supabase CLI, Docker Redis, Mailpit | Để tới Phần 6 | — |

**Không đưa key production cho Claude Code.** Ở local chỉ dùng key test. Các key này bạn tự điền vào `.env.local` (Claude Code chỉ tạo file `.env.example` không có giá trị).

### 0.3 Việc song song của marketing (không chờ code)
- Chốt 3–5 agency design partner, xin đồng ý cho kết nối tài khoản quảng cáo (E1, E4).
- Lên lịch 10 phỏng vấn giá (E3).

---

## Phần 1. Khởi tạo repo

### 1.1 Tạo thư mục và đưa tài liệu vào

Trong Ubuntu:

```bash
mkdir -p ~/projects && cd ~/projects
git clone git@github.com:<tài-khoản-của-bạn>/adxlens.git
cd adxlens
mkdir -p docs/architecture docs/adr docs/runbooks
```

Chép các file đã có vào đúng chỗ:

| File | Đặt tại |
|---|---|
| `CLAUDE.md` | `./CLAUDE.md` (gốc repo) |
| `prd-meta-ads-intelligence.md` | `docs/prd.md` |
| `adxlens-architecture-L1-conceptual.md` | `docs/architecture/L1-conceptual.md` |
| `adxlens-architecture-L2-logical.md` | `docs/architecture/L2-logical.md` |
| `adxlens-architecture-L3-technical.md` | `docs/architecture/L3-technical.md` |
| File hướng dẫn này | `docs/implementation-guide.md` |

```bash
git add . && git commit -m "docs: PRD, architecture L1-L3, CLAUDE.md" && git push
```

### 1.2 Mở trong VS Code

```bash
code .
```

Mở Claude Code: `Ctrl+Shift+P` → **Claude Code: Open in New Tab**. Kiểm tra extension đã nhận `CLAUDE.md` bằng cách hỏi: *"Tóm tắt 10 quy tắc tuyệt đối trong CLAUDE.md"*.

---

## Phần 2. Cách làm việc với Claude Code (đọc một lần)

### 2.1 Nhịp làm việc cho mỗi mốc

```
1. Mở tab mới (phiên VIẾT)   → dán prompt của mốc → yêu cầu lập kế hoạch trước (/plan)
2. Đọc kế hoạch, sửa nếu cần  → cho phép thực hiện
3. Claude Code viết + chạy test → mở PR (hoặc commit trên nhánh)
4. Mở tab mới khác (phiên REVIEW) → dán prompt review (2.3) → nhận "Đạt / Cần sửa / Chặn"
5. Quay lại phiên VIẾT để sửa nếu cần
6. Bạn kiểm tra theo "PM kiểm tra" của mốc → merge
```

- **Một tab = một mốc hoặc một phần của mốc.** Khi chuyển mốc, mở tab mới để ngữ cảnh gọn.
- **Dùng `/plan` cho mọi mốc.** Đọc kế hoạch trước khi cho viết code giúp bạn bắt sai hướng sớm và rẻ.
- **Chế độ quyền:** dùng **Manual** (hỏi trước khi sửa) cho vùng bảo vệ (`execution`, `db`, `infra`, `flags`, `connections`). Với UI và landing page có thể dùng chế độ tự chấp nhận chỉnh sửa. Chế độ hiển thị ở cuối ô nhập prompt.
- **Dùng `@`** để chỉ tài liệu: ví dụ `@docs/architecture/L3-technical.md` mục 5.2.

### 2.2 Prompt mở đầu cho mỗi phiên viết (dán trước prompt của mốc)

```
Bạn đang làm việc trên repo AdxLens. Đọc CLAUDE.md và tuân thủ tuyệt đối.
Tài liệu: @docs/prd.md @docs/architecture/L2-logical.md @docs/architecture/L3-technical.md
Phạm vi phiên này: [TÊN MỐC]. Không sửa ngoài phạm vi.
Cách làm: lập kế hoạch trước, liệt kê file sẽ tạo/sửa, các test sẽ viết, và mọi chỗ chạm vùng bảo vệ.
Khi xong: chạy pnpm lint && pnpm typecheck && pnpm test, tạo nhánh feat/[mốc], commit, mở PR theo template.
Nếu tài liệu mâu thuẫn hoặc thiếu thông tin, dừng và hỏi tôi, không tự đoán.
```

### 2.3 Prompt cho phiên review độc lập (tab mới)

```
Bạn là reviewer độc lập cho repo AdxLens. Đọc CLAUDE.md, mục "Khi review PR".
Chỉ dùng diff của nhánh [tên-nhánh] so với main và mô tả PR. Không xem lịch sử phiên viết.
Chạy: git diff main...[tên-nhánh]
Kiểm tra theo đúng thứ tự trong CLAUDE.md. Kết luận Đạt / Cần sửa (liệt kê cụ thể, có file:dòng) / Chặn.
Không sửa code; chỉ báo cáo.
```

### 2.4 Khi Claude Code báo lỗi hoặc làm sai
- Dán nguyên thông báo lỗi, yêu cầu **tái hiện bằng test trước rồi mới sửa**.
- Nếu nó đề xuất nới test, tắt kiểm tra, hay đổi ngưỡng: từ chối, nhắc quy tắc số 4, 6, 8 trong `CLAUDE.md`.
- Nếu một phiên đi lan man: mở tab mới, nêu lại phạm vi.

---

## Phần 3. Xây theo mốc

Thứ tự: **B0 → L → B1 → B2 → B3 → B4 → B6 → B5 → B7 → B8 → B9**. Mốc **L** (landing, đăng ký, đăng nhập) không có trong L3; prompt của L yêu cầu Claude Code bổ sung vào L3 và viết ADR.

Mỗi mốc gồm: mục tiêu · prompt (dán sau prompt mở đầu 2.2) · bạn chuẩn bị gì · PM kiểm tra gì.

---

### B0. Nền móng

**Mục tiêu:** monorepo chạy được, CI, DB local, tenancy, cờ tính năng, khung vận hành, test cách ly workspace.

**Prompt:**
```
Mốc B0 theo L3 mục 17 và cấu trúc repo ở L3 mục 3.
Làm:
1. Monorepo pnpm + Turborepo: apps/web (Next.js App Router), apps/worker (Node + BullMQ), packages/core, db, meta-client, jobs, ui, config. TypeScript strict, ESLint, Prettier, Vitest.
2. Local stack: Supabase CLI (Postgres, Auth, Storage, Mailpit/Inbucket cho email) + docker-compose cho Redis 7. Script pnpm dev chạy web + worker + kiểm tra các dịch vụ đã lên.
3. packages/db: Drizzle schema cho các bảng tenancy, ad_accounts, meta_connections, feature_flags, flag_change_log, ops_incidents theo L3 mục 5.2, 18.1, 19.1. RLS policies trong infra/supabase.
4. packages/core/tenancy, flags (isEnabled, phụ thuộc giữa cờ, checklist rỗng để mốc sau điền), ops (health_check job, bảng incident).
5. Bộ test cách ly workspace (L3 mục 14) chạy được với 2 workspace giả.
6. .env.example đầy đủ biến (không có giá trị thật), zod validate env khi khởi động.
7. GitHub Actions CI theo L3 mục 13.1; CODEOWNERS; pull_request_template.md.
8. docs/onboarding.md bản đầu: cách cài và chạy local.
```

**Bạn chuẩn bị:** không cần key gì.

**PM kiểm tra:**
- [ ] `pnpm install && pnpm dev` chạy không lỗi; mở được `http://localhost:3000`.
- [ ] `supabase status` hiển thị Studio và Mailpit (mở được trên trình duyệt).
- [ ] `pnpm test` xanh, có test cách ly workspace.
- [ ] CI trên GitHub xanh cho PR đầu tiên.

---

### L. Landing page, đăng ký, đăng nhập

**Mục tiêu:** trang công khai giới thiệu sản phẩm; đăng ký bằng email (xác minh email), đăng nhập, quên mật khẩu; sau đăng nhập vào app; trang giá, chính sách quyền riêng tư, điều khoản, hướng dẫn xóa dữ liệu (Meta yêu cầu khi duyệt app).

**Prompt:**
```
Mốc L (không có trong L3; bổ sung vào L3 mục 3 và viết ADR-0002 "Landing và auth trong apps/web").
Làm trong apps/web:
1. Route group (marketing): / (landing), /pricing, /privacy, /terms, /data-deletion. Song ngữ vi/en (next-intl). Nội dung landing theo định vị PRD mục 13.1; trang giá đọc từ cấu hình gói (giá tạm, chỉnh được trong 1 file).
2. Auth bằng Supabase Auth: /signup (email + mật khẩu, bắt buộc xác minh email), /login, /forgot-password, /reset-password, đăng xuất. Email xác minh đi qua Mailpit ở local.
3. Sau khi đăng ký lần đầu: tạo Workspace, người đăng ký là owner, chọn ngôn ngữ và múi giờ mặc định.
4. Route group (app) có middleware bắt buộc đăng nhập; layout app có chuyển workspace (nếu thuộc nhiều workspace), mời thành viên bằng email, vai trò owner/manager/buyer.
5. Vai trò staff (đội AdxLens) tách riêng; trang /admin chỉ staff vào được (L3 mục 18.2). Script seed tạo tài khoản staff cho tôi ở local.
6. Test: đăng ký → xác minh → đăng nhập → tạo workspace; người chưa đăng nhập bị chặn khỏi (app); buyer không vào được /admin.
```

**Bạn chuẩn bị:** nội dung chính sách quyền riêng tư và điều khoản bản nháp (Claude Code có thể soạn khung, nhưng nên nhờ tư vấn pháp lý sau).

**PM kiểm tra:**
- [ ] Mở `localhost:3000` thấy landing vi/en, trang giá.
- [ ] Đăng ký, nhận email xác minh trong Mailpit, bấm link, đăng nhập vào app.
- [ ] Quên mật khẩu hoạt động.
- [ ] Mời một email khác làm buyer; buyer không vào được `/admin`.

---

### B1. Kết nối Meta, đồng bộ, đối chiếu (đây cũng là E4)

**Mục tiêu:** kết nối tài khoản Meta (chỉ đọc), chọn tài khoản, gán Client có xác nhận, backfill 90 ngày, đồng bộ hằng ngày, đối chiếu ≤ 1%.

**Prompt:**
```
Mốc B1 theo L3 mục 6, 7.3 và L2 DFD-1.
Làm:
1. packages/meta-client: OAuth (scope đọc), đổi long-lived token, phân trang, retry/backoff, giới hạn đồng thời, ghi job_audit. META_API_VERSION cấu hình qua env.
2. packages/core/connections: mã hóa token AES-256-GCM (L3 5.4), import ad accounts, gợi ý Client, assign với assignment_status confirmed.
3. packages/core/ingestion + worker: backfill theo lô 7 ngày (ưu tiên 30 ngày gần nhất trước), daily sync 3 ngày gần nhất, lưu analytics.entities và insights_daily.
4. packages/core/reconciliation: so sánh theo ngày, ngưỡng 1% là hằng số có test khóa; kết quả vào reconciliation_results.
5. Playbook ops: meta_rate_limited, reconcile_retry, token_expiring (L2 mục 11.2).
6. UI: trang Kết nối (nút Kết nối Meta, danh sách tài khoản, gán Client, xác nhận), trang trạng thái đồng bộ và đối chiếu.
7. Script E4: chạy backfill + đối chiếu cho các tài khoản đã kết nối, xuất báo cáo markdown: độ lệch theo ngày, các trường dữ liệu có/không có cho 9 nhóm quy tắc ở PRD 9.4.
8. Test với Meta mock (msw); không gọi Meta thật trong CI.
```

**Bạn chuẩn bị:**
- Điền `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEY_V1` (Claude Code chỉ cách sinh khóa ngẫu nhiên) vào `.env.local`.
- Trong Meta app, thêm redirect URI cho local (Claude Code sẽ cho đường dẫn cụ thể). Nếu Meta yêu cầu HTTPS cho redirect, dùng tunnel ở Phần 5.
- Tài khoản quảng cáo thật của design partner (có đồng ý) để chạy E4.

**PM kiểm tra:**
- [ ] Bấm "Kết nối Meta", đăng nhập Facebook, thấy danh sách tài khoản quảng cáo.
- [ ] Gán vào Client, xác nhận; thấy tiến độ backfill.
- [ ] Trang đối chiếu: các ngày đều `ok` (≤ 1%), hoặc có giải thích.
- [ ] Mở Supabase Studio: cột `token_ciphertext` là dữ liệu mã hóa, không đọc được token.
- [ ] Có file báo cáo E4. **Đây là kết quả cho cổng V0.**

---

### B2. Insight engine

**Prompt:**
```
Mốc B2 theo L2 mục 5 và L3 mục 8.
Làm: 9 quy tắc ở PRD mục 9.4 (chỉ bật các nhóm mà báo cáo E4 xác nhận có dữ liệu; nhóm còn lại tạo khung nhưng tắt), health score, findings + feedback (seen/done/dismissed/wrong), deep link Ads Manager.
Ngưỡng từng quy tắc: dùng fixture và kỳ vọng trong docs/rules/ (tôi sẽ điền). Nếu chưa có, tạo file mẫu và dừng để tôi điền.
Mỗi quy tắc: test fixture + test "không đủ dữ liệu thì không phát hiện".
UI: danh sách phát hiện theo tài khoản (lọc), trang chi tiết phát hiện (bằng chứng, biểu đồ xu hướng, vì sao, nên làm gì, nút mở Ads Manager), tổng quan agency theo Client.
```

**Bạn chuẩn bị:** điền `docs/rules/*.md`: với mỗi quy tắc, ngưỡng mong muốn và 1–2 ví dụ "phải phát hiện" / "không được phát hiện". Đây là phần chuyên môn của bạn, quyết định chất lượng audit.

**PM kiểm tra:**
- [ ] Phát hiện trên tài khoản thật có hợp lý không (tự đánh dấu "sai" những cái không hợp lý; mục tiêu ≤ 20%).
- [ ] Nút mở Ads Manager đưa đúng tới đối tượng.

---

### B3. Báo cáo & chia sẻ

**Prompt:**
```
Mốc B3 theo L2 mục 6 và L3 mục 9.
Làm: ReportContent JSON; mẫu báo cáo vi/en dùng chung cho web và PDF; thương hiệu workspace/Client (logo, màu); tóm tắt LLM + bộ kiểm tra số (ANTHROPIC_API_KEY; khi không có key thì dùng tóm tắt mẫu); share link (token, hạn, thu hồi); trang công khai (ở local dùng đường dẫn /r/[token]); PDF qua worker-render; nhãn "Powered by AdxLens" theo gói; chặn chia sẻ khi có tài khoản chưa confirmed hoặc đối chiếu warning (cả tầng API và trigger DB).
Cờ: p0_reports kiểm tra ở API và job.
Test: số trong tóm tắt LLM khớp 100%; chặn chia sẻ đúng điều kiện; link thu hồi thì trả 404.
```

**Bạn chuẩn bị:** `ANTHROPIC_API_KEY` trong `.env.local` (tùy chọn); logo mẫu.

**PM kiểm tra:**
- [ ] Tạo báo cáo cho một Client, xem bản web và PDF.
- [ ] Mở link chia sẻ trong cửa sổ ẩn danh (không đăng nhập) — xem được, có nhãn "Powered by".
- [ ] Thu hồi link → mở lại báo lỗi.
- [ ] So từng con số trong tóm tắt với số liệu trên báo cáo.

---

### B4. Thông báo & lịch

**Prompt:**
```
Mốc B4 theo L2 mục 9 (jobs) và PRD P0-17, P0-19.
Làm: digest hằng tuần theo múi giờ workspace; lịch gửi báo cáo cho Client (link hoặc PDF qua email); cảnh báo nội bộ (đối chiếu warning, incident); trang demo tài khoản mẫu (dữ liệu giả, ghi rõ là mẫu).
Email: ở local gửi qua SMTP của Mailpit; tạo adapter để staging/production dùng Resend.
Thêm lệnh dev để kích hoạt ngay một job theo lịch (không phải chờ thứ Hai).
```

**PM kiểm tra:**
- [ ] Chạy lệnh kích hoạt digest, thấy email trong Mailpit, đúng ngôn ngữ.
- [ ] Đặt lịch gửi báo cáo, kích hoạt, thấy email có link/PDF.
- [ ] Trang demo xem được khi chưa kết nối Meta.

---

### B6. Thanh toán đầy đủ

**Mục tiêu:** chọn gói, thanh toán, gia hạn, nâng/hạ gói, hủy, xử lý thanh toán thất bại, hóa đơn; quyền tính năng theo gói (gỡ nhãn, số tài khoản).

**Prompt:**
```
Mốc B6 theo L2 M10, L3 mục 2 (Stripe + cổng VN) và PRD mục 13.3.
Làm:
1. Cấu hình gói trong 1 file: Free (1 tài khoản active, có nhãn), các bậc trả phí theo số tài khoản active 30 ngày (giá tạm), gói cao gỡ nhãn. Đồng bộ với Stripe Prices bằng script.
2. Stripe: Checkout (subscription), Customer Portal (đổi gói, cập nhật thẻ, hủy, xem hóa đơn), webhook có xác minh chữ ký: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed. Idempotent theo event id.
3. Số tài khoản active cập nhật hằng ngày (recompute_active_30d); vượt hạn mức gói thì nhắc nâng gói, không chặn đồng bộ dữ liệu ngay (cho thời gian ân hạn, cấu hình được).
4. Cổng VN (PayOS hoặc tương đương): thanh toán theo kỳ (tháng/quý) qua link/QR, webhook xác nhận, tự gia hạn kỳ khi đã trả; nhắc gia hạn qua email trước hạn. Kiểm tra trong tài liệu chính thức của cổng xem có hỗ trợ thanh toán định kỳ không; nếu không, làm theo cách hóa đơn từng kỳ.
5. Trang Billing trong app: gói hiện tại, số tài khoản active, lịch sử thanh toán, nút đổi gói/hủy.
6. Quyền theo gói kết hợp cờ (L2: tính năng chỉ hiện khi cả cờ và gói cho phép).
7. Test: mọi loại webhook (dùng fixture event), thanh toán thất bại → trạng thái past_due → email; hủy → về Free cuối kỳ.
```

**Bạn chuẩn bị:**
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`; chạy `stripe login`.
- Khi test webhook: `stripe listen --forward-to localhost:3000/api/webhooks/payment` và chép `STRIPE_WEBHOOK_SECRET` (whsec_…) vào `.env.local`.
- Key sandbox của cổng VN; webhook của cổng VN cần URL công khai → dùng tunnel (Phần 5).

**PM kiểm tra:**
- [ ] Từ /pricing chọn gói → Stripe Checkout → thẻ test thành công (`4242 4242 4242 4242`, ngày bất kỳ trong tương lai, CVC bất kỳ) → quay lại app, gói đã đổi.
- [ ] Thẻ test bị từ chối (xem danh sách thẻ test trong tài liệu Stripe) → báo lỗi đúng.
- [ ] Customer Portal: đổi gói, hủy; app cập nhật theo webhook.
- [ ] Gói cao → nhãn "Powered by" biến mất trên báo cáo.
- [ ] Thanh toán qua cổng VN (sandbox) → webhook → kỳ được gia hạn.

---

### B5. P1: gợi ý & creative

**Prompt:**
```
Mốc B5 theo PRD mục 10, L2 M6.
Làm: creative library (gom theo creative gốc, thumbnail), so sánh và phân loại creative, dự báo mệt (ghi rõ là dự báo), Weekly Action List (xếp hạng tác động × độ tin cậy ÷ công sức), trạng thái và gán việc, đo trước/sau (ghi rõ giới hạn nhân quả), digest cho media buyer, báo cáo khách v2, onboarding media buyer.
Tất cả sau cờ p1_recommendations; test "cờ tắt thì 404/không chạy". Điền checklist kỹ thuật của cờ theo L3 mục 18.3.
Không có thống kê theo từng media buyer (nguyên tắc không giám sát cá nhân).
```

**PM kiểm tra:**
- [ ] Khi cờ tắt: không thấy menu P1, gọi API trả 404.
- [ ] Vào /admin bật `p1_recommendations` cho workspace test (phải nhập lý do; checklist hiển thị).
- [ ] Action List có nội dung hợp lý trên dữ liệu thật.

---

### B7. P2a: duyệt 1 click (vùng bảo vệ cao nhất)

**Mục tiêu:** từ một gợi ý, duyệt → hệ thống thực thi trên Meta → xác minh → log → hoàn tác được; kill switch; circuit breaker.

**Chế độ quyền:** để Claude Code ở **Manual** cho toàn bộ mốc này. Tách thành nhiều PR nhỏ: (a) OAuth nâng quyền ghi, (b) guardrails + permission check, (c) executor + verifier, (d) action log + undo, (e) kill switch + circuit breaker, (f) UI duyệt.

**Prompt (cho từng phần):**
```
Mốc B7 phần [a–f] theo L2 mục 7, L3 mục 7.4, 14, 17.2.
Chỉ Execution Gateway được ghi lên Meta. Guardrails mặc định thận trọng và có test khóa giá trị.
Bắt buộc test: Meta trả lỗi giữa chừng, verify không khớp, retry trùng (idempotency), undo, kill switch đang bật, cờ p2a_approve tắt.
Thêm script test tích hợp chạy với tài khoản quảng cáo test/sandbox của Meta (không phải tài khoản thật của khách); script từ chối chạy nếu ad account không nằm trong danh sách cho phép ở env.
Điền checklist kỹ thuật của cờ p2a_approve (L3 18.3). Thêm lệnh CLI kill switch dự phòng.
```

**Bạn chuẩn bị:**
- Tài khoản quảng cáo test/sandbox của Meta (cách tạo xem tài liệu Marketing API hiện hành). **Không dùng tài khoản thật của khách cho mốc này.**
- Danh sách ID tài khoản test được phép vào `.env.local` (biến `EXECUTION_ALLOWED_TEST_ACCOUNTS`).
- Ở chế độ phát triển, app Meta thường cho phép admin/developer/tester dùng quyền ghi trước khi App Review; kiểm tra lại trong tài liệu Meta.

**PM kiểm tra:**
- [ ] Trên tài khoản test: duyệt "tạm dừng ad" → ad tạm dừng trong Ads Manager → log ghi trước/sau → hoàn tác → ad chạy lại.
- [ ] Đổi ngân sách vượt guardrails → bị từ chối, có lý do.
- [ ] Bật kill switch (web và CLI) → mọi duyệt bị chặn.
- [ ] Ngắt mạng giả lập hoặc dùng mock lỗi → hành động `failed`, có incident P1, có cảnh báo.
- [ ] Coverage `packages/core/execution` ≥ 90%.

---

### B8. P2b: tự chạy có phanh

**Prompt:**
```
Mốc B8 theo L3 mục 18.4.
Làm: automation_rules + rule_evaluations; rule builder có mẫu dựng từ gợi ý P1; backtest 30 ngày trên snapshot; shadow mode (chỉ ghi would_do); evaluate_rules cho rule live, tạo actions tier=auto qua đúng Execution Gateway; rule chỉ chuyển live khi shadow ≥ 14 ngày và cờ p2b_auto bật.
Thêm lệnh dev để giả lập thời gian shadow khi test ở local (chỉ hoạt động ở môi trường local).
Test: guardrails chặn, rule bị circuit breaker tắt sau lỗi liên tiếp, tắt cờ thì không đánh giá.
```

**PM kiểm tra:**
- [ ] Tạo rule từ mẫu, xem backtest "sẽ làm gì".
- [ ] Shadow mode ghi `would_do`, không có thay đổi trên Meta.
- [ ] Giả lập đủ thời gian shadow, bật `p2b_auto` cho workspace test, rule live chạy trên tài khoản test, có log và hoàn tác.

---

### B9. Vận hành tự động & sẵn sàng bàn giao

**Prompt:**
```
Mốc B9 theo L2 mục 11 và L3 mục 19, 20.
Làm: hoàn thiện playbook (worker_stuck, deploy_smoke_failed, execution_failed); trang /admin/incidents; quy trình agent-diagnose (issue template, hướng dẫn trong CLAUDE.md đã có); runbook đầy đủ trong docs/runbooks; docs/onboarding.md hoàn chỉnh; E2E Playwright cho luồng ở Phần 4 của hướng dẫn triển khai; script "diễn tập sự cố" giả lập 3 sự cố: Meta rate limit, đối chiếu lệch, thực thi lỗi.
```

**PM kiểm tra:**
- [ ] Chạy script diễn tập: mỗi sự cố được playbook xử lý đúng, có incident, có cảnh báo.
- [ ] `pnpm test:e2e` xanh.
- [ ] Một người chưa biết dự án đọc `docs/onboarding.md` có thể chạy local trong ≤ 1 giờ (nhờ marketing thử).

---

## Phần 4. Kiểm thử đầu-cuối trên local

Chạy toàn bộ checklist này sau B9 (hoặc từng phần sau mỗi mốc liên quan).

### 4.1 Khởi động

```bash
cd ~/projects/adxlens
supabase start          # Postgres, Auth, Storage, Mailpit
docker compose up -d    # Redis
pnpm dev                # web + worker
stripe listen --forward-to localhost:3000/api/webhooks/payment   # terminal riêng
```

### 4.2 Luồng khách hàng mới

| # | Bước | Kỳ vọng |
|---|---|---|
| 1 | Mở `localhost:3000` | Landing vi/en, trang giá, chính sách |
| 2 | Đăng ký email mới | Email xác minh trong Mailpit |
| 3 | Xác minh, đăng nhập | Vào app, workspace mới được tạo |
| 4 | Xem demo tài khoản mẫu | Báo cáo mẫu có nhãn "dữ liệu mẫu" |
| 5 | Kết nối Meta (chỉ đọc) | Thấy danh sách tài khoản quảng cáo |
| 6 | Gán tài khoản vào Client, xác nhận | Backfill chạy, có tiến độ |
| 7 | Chờ đồng bộ xong (≤ 10 phút mục tiêu) | Đối chiếu `ok` |
| 8 | Xem phát hiện | Có bằng chứng, nút mở Ads Manager |
| 9 | Tạo báo cáo, xem PDF | Số liệu khớp, có thương hiệu |
| 10 | Tạo link chia sẻ, mở ẩn danh | Xem được, có "Powered by" |
| 11 | Kích hoạt digest | Email trong Mailpit |
| 12 | Mua gói trả phí (thẻ test) | Gói đổi, nhãn gỡ theo gói |
| 13 | Hủy gói trong Customer Portal | Về Free cuối kỳ |

### 4.3 Luồng PM phát hành

| # | Bước | Kỳ vọng |
|---|---|---|
| 1 | Đăng nhập tài khoản staff, vào `/admin/flags` | Thấy workspace × cờ, checklist |
| 2 | Bật `p1_recommendations` | Bị chặn nếu checklist chưa đạt; ghi lý do vượt qua được ghi log |
| 3 | Workspace thấy Action List | Có nội dung |
| 4 | Bật `p2a_approve` (workspace dùng tài khoản test) | Thấy nút "Duyệt" |
| 5 | Duyệt, hoàn tác | Thay đổi thật trên tài khoản test, log đầy đủ |
| 6 | Bật kill switch | Mọi duyệt bị chặn |
| 7 | Tắt cờ | Tính năng ẩn, dữ liệu còn nguyên |

### 4.4 Luồng an toàn (phải thất bại đúng cách)

| # | Thử | Kỳ vọng |
|---|---|---|
| 1 | Tài khoản workspace A gọi API lấy báo cáo của workspace B | 404 |
| 2 | Chia sẻ báo cáo khi tài khoản chưa xác nhận Client | Bị chặn |
| 3 | Sửa số trong DB local để đối chiếu lệch > 1% | Báo cáo bị chặn chia sẻ, có cảnh báo |
| 4 | Buyer vào `/admin` | Bị chặn |
| 5 | Gọi API P1 khi cờ tắt | 404 |
| 6 | Tìm token Meta trong log (`pnpm dev` output, Supabase logs) | Không có |

---

## Phần 5. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `docker ps` lỗi trong Ubuntu | Chưa bật WSL Integration | Docker Desktop → Settings → Resources → WSL Integration |
| `supabase start` rất chậm hoặc lỗi cổng | Cổng bị chiếm; Docker thiếu RAM | `supabase stop`, kiểm tra cổng; tăng RAM cho Docker |
| Mọi thứ chậm | Repo nằm trên `C:\` (`/mnt/c/...`) | Chuyển repo vào `~/projects` trong WSL |
| Meta OAuth báo redirect URI không hợp lệ | URI trong Meta app không khớp, hoặc cần HTTPS | Thêm đúng URI; nếu cần HTTPS: `cloudflared tunnel --url http://localhost:3000`, dùng URL `https://…trycloudflare.com` làm `APP_URL` và redirect URI (URL đổi mỗi lần chạy) |
| Không thấy tài khoản quảng cáo | Người đăng nhập không có quyền trên tài khoản đó; app ở chế độ phát triển chỉ cho tester | Thêm người đó làm tester của app; kiểm tra quyền trong Business Manager |
| Stripe webhook không tới | Chưa chạy `stripe listen` hoặc sai `STRIPE_WEBHOOK_SECRET` | Chạy lại, chép whsec mới (đổi mỗi lần `stripe listen`) |
| Webhook cổng VN không tới | localhost không công khai | Dùng tunnel như trên; đăng ký URL webhook tunnel trong sandbox của cổng |
| Không nhận email | Ứng dụng chưa trỏ SMTP về Mailpit | Kiểm tra cấu hình email local; mở giao diện Mailpit từ `supabase status` |
| Claude Code sửa test để CI xanh | — | Từ chối; yêu cầu tái hiện lỗi bằng test và sửa code |
| Claude Code muốn đọc `.env.local` | — | Không cần; chỉ cho xem `.env.example` |

---

## Phần 6. Sau khi chạy local: bước tiếp theo

1. **Cổng V0:** dùng báo cáo E4 (B1) + kết quả E1, E3 của marketing để quyết định có bật `p0_reports` cho design partner không (PRD 8.4).
2. **Staging:** tạo Supabase project (Singapore), Upstash Redis, Railway (worker), Vercel (web), Resend; bảo Claude Code viết `docs/runbooks/deploy-staging.md` theo L3 mục 4 và 13. Bạn tự nhập secrets trên dashboard từng dịch vụ.
3. **Meta App Review:** nộp `ads_read` khi landing (chính sách, xóa dữ liệu) và luồng kết nối đã chạy trên staging với HTTPS và tên miền thật. Nộp `ads_management` sau B7.
4. **Production:** chỉ sau khi staging chạy ổn với design partner; dùng key thanh toán thật và tên miền chính thức.
5. **Review bên ngoài (khuyến nghị):** trước khi bật `p2a_approve` cho khách thật.

Khi tới bước 2, bảo Claude Code: *"Soạn hướng dẫn triển khai staging theo L3, cùng định dạng với docs/implementation-guide.md"*.
