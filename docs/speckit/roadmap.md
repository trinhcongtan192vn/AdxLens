# AdxLens — Lộ trình feature Spec Kit

Ngày: 22/10/2026. Nguồn: `docs/implementation-guide.md` (Phần 3), `docs/architecture/L3-technical.md` (mục 17, 18), `docs/prd.md` (mục 6), `docs/design/ux-requirements.md` (mục 6, 9), `docs/speckit/PROMPTS.md` (mục 5).

## Cách đọc

- Thứ tự mốc: **B0 → L → B1 → B2 → B3 → B4 → B6 → B5 → B7 → B8 → B9**. Mỗi dòng là một feature Spec Kit: một nhánh, một thư mục `specs/NNN-<tên>/`, và **một PR khoảng 400 dòng trở xuống** (không tính code sinh tự động, lockfile, migration sinh bởi drizzle-kit).
- Spec Kit 1.2.0 chỉ đánh số nguyên liên tục (`create-new-feature.ps1` không nhận hậu tố chữ), nên mốc lớn được tách thành nhiều số liên tiếp thay vì `003a`, `003b`. Số và tên nhánh là **dự kiến**; số thật do `/speckit-specify` cấp khi tạo feature.
- Khi chạy `/speckit-specify` cho một dòng: dán khối của mốc trong `PROMPTS.md` mục 5, rồi thu hẹp phạm vi theo cột "Mục tiêu" và "Màn hình" của dòng đó.
- Cờ: `p0_reports`, `p1_recommendations`, `p2a_approve`, `p2b_auto` (L3 18.1). "—" là không thuộc cờ nào. Code P1/P2 phải có test "cờ tắt thì không chạy" (CLAUDE.md quy tắc 7).
- Vùng bảo vệ (CLAUDE.md): `execution`, `db` (migration, RLS), `infra`, `flags`, `connections`. Feature chạm vùng này cần PM duyệt; chạm `execution` thì chạy thêm test tích hợp trên staging.
- Cách chia và ước lượng số dòng là của tôi (Claude Code), không có trong tài liệu nguồn; PM có thể gộp hoặc tách lại.

## Bảng feature

| # | Nhánh dự kiến | Mốc | Mục tiêu | Module core / package | Màn hình | Phụ thuộc | Vùng bảo vệ | Cờ |
|---|---|---|---|---|---|---|---|---|
| 001 | `001-monorepo-ci` | B0 | Khung monorepo pnpm + Turborepo, TS strict, ESLint, Prettier, Vitest; `packages/config` (env zod); Docker Compose cho Postgres + Redis; `pnpm dev`; CI GitHub Actions, CODEOWNERS, PR template; `.env.example`; `docs/onboarding.md` bản đầu | config | — | — | infra | — |
| 002 | `002-db-tenancy` | B0 | `packages/db` (Drizzle, schema `app` + `analytics`, client); bảng workspaces, members, vai trò owner/manager/buyer; RLS; `core/tenancy` | db, tenancy | — | 001 | db | — |
| 003 | `003-feature-flags` | B0 | Bảng `feature_flags`, `flag_change_log`; `core/flags`: `isEnabled`, phụ thuộc giữa cờ, tắt dây chuyền, cache Redis 60 giây, checklist rỗng để mốc sau điền; mặc định tắt | flags, db | — | 002 | db, flags | cả 4 cờ (chỉ hạ tầng) |
| 004 | `004-ops-logging-isolation` | B0 | Logger Pino (redact, `workspace_id`, `job_id`), `AppError`; khung `core/ops` (health check job, bảng incident); `packages/jobs`; bộ test cách ly workspace với 2 workspace giả, CI đỏ khi endpoint/job mới không đăng ký | ops, db, jobs | — | 002 | db | — |
| 005 | `005-app-shell` | B0 | `apps/web` shell: next-intl vi/en, token CSS từ `design-system.md`, thanh trên (bộ chọn kỳ toàn cục, chọn workspace, avatar), sidebar 9 mục (mục P1/P2 ẩn khi cờ tắt), trang lỗi | tenancy, flags (đọc) | App shell (theo O01), X01, X02, X03 | 003, 004 | — | đọc cờ để ẩn mục P1/P2 |
| 006 | `006-marketing-pages` | L | Trang công khai song ngữ; bảng giá đọc từ cấu hình gói (4 gói theo ux-requirements 9.1, giá tạm) | — (apps/web) | M01–M05 | 005 | — | — |
| 007 | `007-auth` | L | ADR-0002 + bổ sung L3 cho xác thực (Supabase Auth) trước khi code; đăng ký (không lộ email đã tồn tại), xác minh email, đăng nhập, quên/đặt lại mật khẩu, middleware bắt buộc đăng nhập; email qua Mailpit | tenancy | A01–A05 (+ trạng thái lỗi) | 005 | db (nếu thêm bảng) | — |
| 008 | `008-workspace-members-settings` | L | Tạo workspace (A07), mời và chấp nhận lời mời (A06), thanh tab Cài đặt, ST01, ST02, ST06, menu avatar X07 + đăng xuất; vai trò `staff` tách riêng, `/admin` chỉ staff, seed tài khoản staff local | tenancy | A06, A07, ST01, ST02, ST06, X07 | 007 | db | — |
| 009 | `009-meta-client` | B1 | `packages/meta-client`: OAuth scope đọc, đổi long-lived token, phân trang, retry/backoff, giới hạn đồng thời, `job_audit`; test bằng msw | meta-client | — | 004 | — | — |
| 010 | `010-connections` | B1 | `core/connections`: mã hóa token AES-256-GCM, chỉ giải mã trong worker; kết nối Meta, import tài khoản QC; banner token hết hạn; test token không lộ ra log/lỗi/API | connections, db | S02 (+ trống, token hết hạn), S03, S04 (+ trống, đang tải), X04 (biến thể token) | 008, 009 | connections, db | — |
| 011 | `011-clients-assignment` | B1 | Client, gợi ý Client, gán tài khoản QC có xác nhận (hàng loạt) | tenancy, connections | C01 (+ trống), C02 (khung đầu), S05 | 010 | db | — |
| 012 | `012-ingestion-sync` | B1 | `core/ingestion` + worker: backfill 90 ngày theo lô 7 ngày (30 ngày gần nhất trước), daily sync 3 ngày, `analytics.entities`, `insights_daily` theo múi giờ ad account, tiền `numeric` | ingestion, db | S06 (+ lỗi) | 011 | db | — |
| 013 | `013-reconciliation` | B1 | `core/reconciliation`: so theo ngày, ngưỡng 1% là hằng số có test khóa; `reconciliation_results`; playbook `meta_rate_limited`, `reconcile_retry`, `token_expiring`; script báo cáo E4 | reconciliation, ops | D04 (+ lệch) | 012 | db | — |
| 014 | `014-disconnect-delete` | B1 | Ngắt kết nối, xóa token và dữ liệu trong thời hạn cam kết, trạng thái đang xóa/đã xóa | connections, ingestion | S07 | 013 | connections, db | — |
| 015 | `015-insight-engine` | B2 | Hợp đồng rule, engine, `findings`, feedback (seen/done/dismissed/wrong), health score, deep link Ads Manager | insight, db | — | 013 | db | — |
| 016 | `016-audit-rules-1` | B2 | Nửa đầu 9 rule PRD 9.4 (chỉ nhóm có dữ liệu theo báo cáo E4); fixture từ `docs/rules/` + test "không đủ dữ liệu" | insight | — | 015 | — | — |
| 017 | `017-audit-rules-2` | B2 | Nửa sau 9 rule, cùng yêu cầu test | insight | — | 016 | — | — |
| 018 | `018-findings-ui` | B2 | Tổng quan agency, tổng quan tài khoản, danh sách và drawer chi tiết phát hiện (bằng chứng, xu hướng, nguồn số) | insight | O01 (+ trống, đang tải), D01, D02 (+ trống, đang tải), D03 | 017 | — | — |
| 019 | `019-report-builder` | B3 | `ReportContent` JSON, mẫu vi/en dùng chung web + PDF, thương hiệu workspace/Client | reporting | R01 (+ trống), R02-R03 | 018 | db | `p0_reports` |
| 020 | `020-llm-summary-number-check` | B3 | Tóm tắt LLM chỉ diễn giải số đã tính; bộ kiểm tra số chặn lưu khi lệch; tóm tắt mẫu khi không có API key | reporting | (trong R03) | 019 | — | `p0_reports` |
| 021 | `021-share-public-report` | B3 | Share link (32 byte, hạn, thu hồi, mật khẩu tùy chọn), trang công khai mobile-first, chặn chia sẻ khi lệch > 1% hoặc chưa xác nhận gán (API + trigger DB) | reporting, reconciliation | R04 (+ chặn BR01), R06 (+ hết hạn) | 020 | db | `p0_reports` |
| 022 | `022-report-pdf` | B3 | PDF A4 qua worker (Playwright), nhãn "Powered by" theo gói | reporting | R07 | 021 | — | `p0_reports` |
| 023 | `023-email-notification-center` | B4 | Adapter email (Mailpit local, Resend staging), mẫu E01–E07 song ngữ, trung tâm thông báo, cài đặt thông báo (thông báo sự cố số liệu và thanh toán luôn bật) | notification | X05, ST05, E01–E07 | 022 | db | — |
| 024 | `024-report-schedules-digest` | B4 | Lịch gửi báo cáo (tự động/cần duyệt), hoãn gửi khi lệch hoặc chưa xác nhận gán, digest tuần theo múi giờ, cảnh báo nội bộ, lệnh dev kích hoạt job | notification, reporting | R05 (+ trống) | 023 | db | `p0_reports` |
| 025 | `025-demo-account` | B4 | Tài khoản mẫu (dữ liệu giả, ghi rõ là mẫu) | ingestion | S01, X04 (biến thể dữ liệu mẫu) | 024 | — | — |
| 026 | `026-plans-entitlements` | B6 | Cấu hình gói (giá không hard-code), đếm tài khoản active 30 ngày, quyền theo gói kết hợp cờ, vượt hạn mức có ân hạn | billing | X04 (vượt hạn mức), M02 (nối cấu hình) | 008, 012 | db | — |
| 027 | `027-stripe-billing` | B6 | Stripe test mode: checkout, customer portal, webhook có xác minh chữ ký và idempotent, past_due + ân hạn, thông tin xuất hóa đơn, hủy gói | billing | ST03 (+ quá hạn), ST04 (+ hủy), E05, X04 (past_due) | 026 | db | — |
| 028 | `028-vn-payment-gateway` | B6 | Cổng thanh toán VN (sandbox): thanh toán theo kỳ, webhook, gia hạn, nhắc gia hạn | billing | (trong ST03) | 027 | db | — |
| 029 | `029-breakeven-page` | B6 | Trang công thức hoà vốn công khai | billing (đọc cấu hình) | M06 | 026 | — | xem câu hỏi 9 |
| 030 | `030-creative-library` | B5 | Creative library (gom theo creative gốc), phân loại, so sánh, dự báo mệt (ghi rõ là dự báo) | recommendation, ingestion | P103 (+ trống), P104 | 018 | db | `p1_recommendations` |
| 031 | `031-weekly-action-list` | B5 | Weekly Action List (xếp hạng), trạng thái, gán việc, digest media buyer; checklist kỹ thuật cờ P1 | recommendation, flags | P101-P102 (+ trống), F-state | 030 | db, flags | `p1_recommendations` |
| 032 | `032-before-after-onboarding` | B5 | Đo trước/sau (ghi rõ giới hạn nhân quả), onboarding Buyer | recommendation | P105 (+ trống), A08 | 031 | — | `p1_recommendations` |
| 033 | `033-write-scope-oauth` | B7 | ADR cho từng loại hành động ghi; nâng quyền ghi Meta (`ads_management`) | connections, execution | P201 | 031 | connections, execution | `p2a_approve` |
| 034 | `034-guardrails-permissions` | B7 | Guardrails mặc định có test khóa (giá trị chờ PM), quyền duyệt theo vai trò và Client (Owner cấp cho Buyer), cột "Duyệt hành động" ở ST02 | execution, tenancy | P205, ST02 (cột duyệt) | 033 | execution, db | `p2a_approve` |
| 035 | `035-executor-verifier` | B7 | Execution Gateway: executor, verifier, idempotency, xử lý lỗi Meta giữa chừng; script test tích hợp chỉ chạy trên tài khoản test cho phép | execution, meta-client | — | 034 | execution | `p2a_approve` |
| 036 | `036-action-log-undo` | B7 | Nhật ký hành động, chi tiết, hoàn tác | execution | P203, P204 (+ thất bại) | 035 | execution, db | `p2a_approve` |
| 037 | `037-kill-switch-circuit-breaker` | B7 | Kill switch workspace và toàn cục, CLI dự phòng, circuit breaker, playbook `execution_failed`; checklist kỹ thuật cờ P2a | execution, ops, flags | AD04, X04 (kill switch) | 036 | execution, flags | `p2a_approve` |
| 038 | `038-approval-dialog` | B7 | Hộp thoại duyệt trước/sau từ gợi ý | execution, recommendation | P202 (trong P202-P203, + trống) | 037 | execution | `p2a_approve` |
| 039 | `039-automation-rules-builder` | B8 | `automation_rules`, rule builder từ mẫu gợi ý P1 | execution | P211 (+ trống), P212 | 038 | execution, db | `p2b_auto` |
| 040 | `040-backtest-shadow` | B8 | Backtest 30 ngày trên snapshot, shadow mode ghi `would_do`, lệnh giả lập thời gian chỉ ở local | execution | P213 (+ trống), P214 | 039 | execution, db | `p2b_auto` |
| 041 | `041-live-rules-effectiveness` | B8 | `evaluate_rules` cho rule live (≥ 14 ngày shadow, cờ bật), tạo action `tier=auto` qua Gateway; hiệu quả tự động hóa | execution | P215 (+ trống) | 040 | execution | `p2b_auto` |
| 042 | `042-admin-flags` | B9 | Ma trận workspace × cờ, hộp thoại bật cờ có checklist, bắt buộc lý do, vượt qua có ghi log | flags, ops | AD01, AD02 | 008 (xem câu hỏi 4) | flags | cả 4 cờ (bật/tắt) |
| 043 | `043-incidents-playbooks` | B9 | Trang sự cố, hoàn thiện playbook `worker_stuck`, `deploy_smoke_failed` | ops | AD03 (+ trống) | 037 | db | — |
| 044 | `044-diagnose-runbooks-onboarding` | B9 | Quy trình issue `agent-diagnose`, runbook đầy đủ, `docs/onboarding.md` hoàn chỉnh | ops (tài liệu) | — | 043 | — | — |
| 045 | `045-e2e-incident-drill` | B9 | E2E Playwright cho luồng ở implementation-guide Phần 4, script diễn tập 3 sự cố | — | — | 044 | — | — |

Màn chưa gán vào feature nào: **X06 Hỗ trợ + "Báo số liệu lệch"** (xem câu hỏi 6).

## PM cần chuẩn bị trước mốc

| Trước | Việc |
|---|---|
| 001 | Không cần key |
| 009–014 | Meta App (`META_APP_ID`, `META_APP_SECRET`), redirect URI local, `TOKEN_ENC_KEY_V1`, tài khoản QC của design partner có đồng ý; thời hạn xóa dữ liệu |
| 016–017 | Ngưỡng và ví dụ cho từng rule trong `docs/rules/*.md` |
| 020 | `ANTHROPIC_API_KEY` (tùy chọn) |
| 026–028 | Giá, số ngày ân hạn, gói của workspace mới; khóa test Stripe; sandbox cổng VN |
| 033–038 | Tài khoản Meta test, `EXECUTION_ALLOWED_TEST_ACCOUNTS`, giá trị mặc định guardrails |

## Câu hỏi cho PM (mâu thuẫn hoặc thiếu giữa các tài liệu)

> **Đã chốt ngày 22/10/2026**, xem `docs/adr/0001-pm-decisions-2026-10-22.md`. Từ thời điểm này PM ủy quyền cho Claude Code xây liên tục toàn bộ feature, không qua từng prompt Spec Kit; PM review và test thủ công ở PR `develop → main`. Theo ADR-0001 B2, feature 042 (admin cờ) làm ngay sau 022.

1. **Stack local.** implementation-guide B0 dùng **Supabase CLI** (Postgres, Auth, Storage, Mailpit) cộng Docker Compose cho Redis. CLAUDE.md ("docker compose (Postgres, Redis)"), PROMPTS B0 và L3 17 chỉ nói Docker Compose. Dùng Supabase CLI (khớp Supabase Auth ở L3 mục 2) hay Postgres thuần trong Compose?
2. **Môi trường Windows.** implementation-guide giả định chạy trong WSL2 Ubuntu; PROMPTS và máy hiện tại dùng PowerShell trên Windows (Docker Desktop backend WSL2). Code và script chạy trực tiếp trên Windows, hay chuyển repo vào WSL2?
3. **Tạo workspace và mời thành viên ở mốc nào.** L3 17 ghi định nghĩa xong của B0 là "tạo workspace và mời thành viên được trên local"; implementation-guide và PROMPTS đặt việc này ở L. Bảng trên theo PROMPTS (B0 chỉ có tenancy ở tầng core, UI ở 008).
4. **Trang admin cờ (AD01, AD02) đến quá muộn.** PROMPTS đặt ở B9. Nhưng L3 17.1 cần bật `p0_reports` cho design partner cuối tuần 3 (sau B3); implementation-guide B5 yêu cầu PM "vào /admin bật `p1_recommendations`"; sitemap-flows đặt Đợt 3 Admin "trước khi bật cờ P1 đầu tiên". Đề xuất chuyển feature 042 lên ngay sau 022 (cuối B3). Đồng ý không?
5. **S01 Demo tài khoản mẫu.** PROMPTS B1 liệt kê S01–S07; implementation-guide và L3 17 đặt trang demo ở B4. Bảng trên theo B4.
6. **X06 Hỗ trợ + "Báo số liệu lệch"** (P0-20, P0-23, luồng F12) không thuộc mốc nào trong PROMPTS, implementation-guide hay L3 17. Đề xuất thêm vào B4 sau 023 (dùng chung kênh thông báo). Đồng ý không?
7. **Diễn giải LLM ở B2.** PROMPTS B2 có "diễn giải LLM chỉ dùng số đã tính và qua bộ kiểm tra số", nhưng bộ kiểm tra số nằm ở `core/reporting` (L3 mục 3) và được xây ở B3. Đề xuất: B2 chỉ có văn bản theo mẫu (không LLM), LLM cho phát hiện chuyển sang sau 020.
8. **Email E01 (xác minh) và E02 (lời mời)** cần ngay ở L (007, 008), nhưng mẫu email song ngữ thuộc B4 (023). Đề xuất: L dùng mẫu tối giản qua Supabase Auth/Mailpit, 023 thay bằng mẫu chính thức.
9. **M06 Trang hoà vốn** là trang công khai thuộc giai đoạn P1, nhưng cờ bật theo workspace nên không áp được cho trang công khai. Đăng M06 công khai luôn khi xong B6, hay ẩn tới khi P1 phát hành?
10. **Cổng thanh toán VN.** L3 mục 2 ghi cổng VN "ở P1"; implementation-guide B6 làm cả Stripe và cổng VN trong cùng mốc. Giữ 028 trong B6 hay để sau?
11. **Gói và quyền P2.** ux-requirements 9.1 đặt hành động có duyệt và rule tự động trong gói Growth (gói thứ 3/4); PRD 13.3 nói quyền ghi P2 là "gói cao hơn hoặc add-on". Gói nào mở P2?
12. **Phiên bản tài liệu nguồn.** implementation-guide và ux-requirements ghi nguồn "PRD v0.4", trong khi PRD hiện là v0.5 (thêm P0-21 → P0-25). Không chặn việc gì; chỉ cần cập nhật dòng nguồn khi tiện.

Câu hỏi đã có từ trước (PROMPTS mục 7), vẫn mở: giá trị mặc định guardrails (trước 034), số ngày ân hạn, giá chính thức, workspace mới dùng Free hay dùng thử Starter (trước 026), thời hạn xóa dữ liệu (trước 014), luồng chuyển quyền Owner (trước 008).
