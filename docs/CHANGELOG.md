# Changelog

Mỗi feature merge vào `develop` có một mục: thay đổi gì, test tự động đi kèm, vùng bảo vệ bị chạm, và cách PM kiểm tra thủ công. PM verify trên `develop` trước khi merge `develop → main`.

## [011] Gán tài khoản QC cho Client: S05, C01, khung C02 — 2026-10-23

**Thay đổi**
- `packages/core/connections/assignment.ts`: gán + xác nhận tài khoản QC cho Client có sẵn hoặc tạo Client mới; tài khoản đã xác nhận cho Client khác → 409 (phải bỏ gán trước); bỏ gán (về "chưa gán"); đếm tài khoản chưa xác nhận (BR01); lưu trữ Client kéo theo trả tài khoản về "chưa gán"; tổng quan C01 (Client actor thấy được + tài khoản đã gán). Chỉ owner/manager (`clients.manage`); không gán vào Client của workspace khác hay Client đã lưu trữ.
- API: `GET /api/v1/ad-accounts`, `POST|DELETE /api/v1/ad-accounts/{id}/assign` (đúng một trong `client_id` / `create_client_name`), `GET|POST /api/v1/clients`, `GET|PATCH|DELETE /api/v1/clients/{id}` (DELETE = lưu trữ, báo cáo cũ giữ nguyên).
- Giao diện theo Penpot:
  - S05 "Gán mỗi tài khoản cho một Client" (bước 4/4): gợi ý "Khớp tên", ô chọn Client có sẵn hoặc "+ Tạo Client mới: <tên gợi ý>", Xác nhận / Đã xác nhận + Đổi, banner "Còn N dòng chưa xác nhận…", hộp thoại "+ Tạo Client mới", "Xong, bắt đầu đồng bộ" → C01.
  - C01 Clients: badge "N Client · M tài khoản", tìm Client/tài khoản (không phân biệt dấu), banner tài khoản chưa xác nhận + "Xác nhận gán", thao tác dòng (Xác nhận gán / Kết nối lại), trạng thái trống, "+ Thêm Client". Cột chi tiêu/health/vấn đề/đối chiếu/báo cáo cuối hiện "—" tới khi có dữ liệu (012, 013, 015+, 023+).
  - C02 Client: breadcrumb, tab Chiến dịch | Nhóm QC | Quảng cáo | Báo cáo | Cài đặt (bảng số liệu ở 012+); tab Cài đặt liệt kê tài khoản QC + Bỏ gán; Đổi tên, Lưu trữ Client.
- i18n vi/en: namespace `clients`.

**Test tự động**
- `packages/core/src/connections/assignment.test.ts` (7): gán Client có sẵn, tạo Client khi gán, 409 khi đã thuộc Client khác + bỏ gán rồi gán lại, không gán vào Client workspace khác, buyer không gán được, lưu trữ Client trả tài khoản về chưa gán, buyer chỉ thấy Client được gán.
- `apps/web/src/app/api/v1/clients/clients.test.ts` (5): luồng S05 → C01, validate body, 409/bỏ gán, tạo/đổi tên/lưu trữ, buyer 403 + chỉ thấy Client của mình.
- `apps/web/src/lib/assign.test.ts` (3), `apps/web/src/lib/clients.test.ts` (3): lựa chọn mặc định S05, tìm không dấu C01.
- Bộ cách ly: probe 8 route mới (có `crossParams`/`crossBody` dùng tài khoản và Client của B).
- E2E `apps/web/e2e/clients-assign.spec.ts`: đăng ký → Meta giả → S04 chọn 2 tài khoản → S05 xác nhận (tên gợi ý + Client tạo bằng hộp thoại) → C01 tìm → C02 → Bỏ gán → banner C01.

**Vùng bảo vệ:** `packages/core/connections/**` (chỉ thêm `assignment.ts`, không chạm token).

**PM kiểm tra:** sau S04 → S05: xác nhận từng dòng, thử đổi Client; vào Clients thấy số Client/tài khoản; mở Client → tab Cài đặt → Bỏ gán → quay lại Clients thấy banner chưa xác nhận.

## [010] Kết nối Meta: OAuth chỉ đọc, token mã hóa, S02–S04 — 2026-10-23

**Thay đổi**
- Bảng `meta_connections` (token AES-256-GCM, `token_key_version` để xoay khóa; RLS bật, **không** policy cho người dùng — chỉ service role đọc), `meta_available_accounts` (danh sách tài khoản truy cập được + chi tiêu 30 ngày), `ad_accounts` (L3 5.2: Client, trạng thái gán suggested/confirmed, đồng bộ, `active_30d`), `job_audit` (mỗi lời gọi Meta: endpoint, tài khoản, thời lượng, mã lỗi — không token).
- `packages/core/connections`: lưu kết nối (cùng tài khoản Meta trong workspace → cập nhật kết nối cũ khi kết nối lại), danh sách kết nối không bao giờ có token, S04 danh sách tài khoản + đã nhập, nhập tài khoản với gợi ý Client theo tên (bỏ hậu tố "- Main", "| VN"…), buyer chỉ thấy tài khoản của Client được gán, sức khỏe token (hết hạn / còn ≤ 7 ngày), `withConnectionToken` (chỉ worker), ghi `job_audit`.
- Job `sync:refresh_accounts` (worker): giải mã token, làm mới danh sách tài khoản và chi tiêu 30 ngày theo múi giờ từng tài khoản (tổng bằng số nguyên, lưu numeric); token bị Meta thu hồi (190) → kết nối "hết hạn".
- OAuth (L3 10.2): `GET /api/v1/connections/meta/authorize` (state ngẫu nhiên, cookie ký HMAC 10 phút gắn workspace + user), `GET …/callback` (kiểm state so sánh hằng thời gian, đổi code → token dài hạn, kiểm quyền `ads_read`, mã hóa + lưu, enqueue làm mới, chuyển tới S04; lỗi Meta → về S02 với thông báo, không lộ token). `META_MOCK=1`: OAuth giả quay về callback, dùng dữ liệu mock — bị chặn ở staging/production.
- API: `GET /api/v1/connections`, `GET /api/v1/connections/{id}/ad-accounts`, `POST /api/v1/ad-accounts/import`.
- Giao diện theo Penpot: S02 Kết nối Meta (bảng theo tài khoản QC: ID rút gọn, Client/gợi ý, token Hợp lệ/Hết hạn/Còn N ngày, đồng bộ cuối, múi giờ, tiền tệ, có chi tiêu 30N, Kết nối lại; banner tổng hợp; trạng thái trống; lỗi OAuth), S03 Giải thích quyền chỉ đọc, S04 Chọn tài khoản (chi tiêu 30 ngày, tự làm mới khi worker đang tính, đếm theo gói, vượt hạn mức chỉ cảnh báo vì có ân hạn — PRD 13.3; trạng thái trống). Bố cục "Thiết lập · bước N/4". Banner hệ thống X04 khi token hết hạn.
- Worker: dịch vụ chung (Meta theo môi trường, khóa token, email), ghi `job_audit` cho mọi lời gọi Meta.
- `scripts/check-boundaries.mjs`: chặn `apps/web` dùng `withConnectionToken`/`decryptToken` (giải mã token chỉ trong worker, quy tắc 2).
- `docs/tech-debt.md`: `currentPlanKey()` trả Free tới feature 026.

**Test tự động**
- `packages/core/src/connections/connections.test.ts` (11): AES-GCM (giải mã đúng, sửa byte/sai khóa thất bại, IV ngẫu nhiên), DB chỉ có ciphertext + danh sách không có token, kết nối lại, `withConnectionToken` + kết nối hết hạn, không dùng token workspace khác, buyer không quản lý kết nối, nhập + gợi ý Client, tài khoản không thuộc kết nối, buyer chỉ thấy tài khoản được gán, sức khỏe token, gợi ý tên.
- `packages/core/src/connections/refresh.test.ts` (3): chi tiêu 30 ngày đúng tổng, token thu hồi → hết hạn, cột numeric.
- `apps/web/src/app/api/v1/connections/connections.test.ts` (6): authorize → callback lưu kết nối mã hóa + S04 không lộ token, state sai → 403, state của workspace khác → 403, người dùng từ chối, buyer không kết nối được, nhập tài khoản.
- Bộ cách ly: dữ liệu B có kết nối + tài khoản QC; probe 5 route mới (có `crossBody`); probe job `sync:refresh_accounts` (chạy thật với token mã hóa bằng khóa test) và biến thể dùng kết nối của B.
- `apps/web/src/lib/format.test.ts` (2), `scripts/lib/boundaries.test.ts` (+1).

**Vùng bảo vệ:** `packages/core/connections/**` (token), `packages/db/**` (4 bảng, RLS).

**PM kiểm tra:** `pnpm dev` (worker cùng chạy), đăng nhập → Kết nối → "+ Kết nối tài khoản" → "Tiếp tục với Meta" (mock) → S04 thấy 4 tài khoản, chi tiêu 30 ngày hiện sau vài giây. Supabase Studio: bảng `app.meta_connections` chỉ có `token_ciphertext` dạng bytea.

## [009] Meta client, rate limit API — 2026-10-23

**Thay đổi**
- `packages/meta-client` — lớp duy nhất gọi Meta (L3 6.2):
  - Phân trang theo `paging.next` (bỏ token cũ trong URL next, gắn lại token hiện tại), `appsecret_proof` cho mọi lời gọi.
  - Retry backoff mũ có jitter cho rate limit (4/17/32/613, 80000–80014, HTTP 429; chờ lâu gấp 4) và 5xx/lỗi mạng, tối đa 5 lần; lỗi token (190) và quyền (10, 200–299) không retry.
  - Đọc header `x-business-use-case-usage`: ≥ 75% → giảm đồng thời của app 50%.
  - Giới hạn đồng thời: 1 request/tài khoản QC, 5 request/app.
  - Validate mọi phản hồi bằng zod; hook audit mỗi lời gọi (endpoint, tài khoản, thời lượng, mã lỗi) — không chứa token.
  - Mọi thông điệp lỗi được che token, `client_secret`, `appsecret_proof`, `code`.
  - API đọc: `me`, quyền đã cấp, tài khoản QC, campaign/ad set/ad/creative, insights theo ngày (cửa sổ 7d_click/1d_view); OAuth: URL xin quyền (chỉ đọc P0–P1; P2 thêm `ads_management` + `auth_type=rerequest`), đổi code, đổi token dài hạn.
  - Phần ghi Meta không nằm trong package này lúc này (B7, chỉ `packages/core/execution` được import).
- `@adxlens/meta-client/mock` (chỉ local/test, `META_MOCK=1`): 4 tài khoản (3 VND, 1 USD múi giờ Bangkok), dữ liệu xác định; mẫu cài sẵn cho rule audit (ad mệt, chi tiêu không chuyển đổi, ad thắng bị bỏ đói, learning limited, phân mảnh); "Thời trang Linh" lệch 1,4% ở một ngày để thử đối chiếu.
- API web: giới hạn 600 request/phút/workspace (Redis, header `X-RateLimit-Remaining`, vượt → 429); gỡ khỏi `docs/tech-debt.md`.
- Sửa lỗi Semaphore (phát hiện bằng test): slot được chuyển thẳng cho tác vụ đang chờ, không để tác vụ mới chen vào.

**Test tự động**
- `packages/meta-client/src/http.test.ts` (11, msw): phân trang + appsecret_proof, retry rate limit, retry 5xx tối đa 5 lần, 190 không retry + không lộ token, phản hồi sai định dạng, giảm tốc theo header, insights + attribution, đổi token không gửi access_token + không lộ client_secret, 1 request/tài khoản, giới hạn app khi giảm tốc.
- `packages/meta-client/src/mock.test.ts` (4): xác định, dữ liệu tới hôm qua, account = tổng ad trừ ngày lệch 1,4%, cấu trúc.
- `apps/web/src/server/route.test.ts`: rate limit 600/phút, workspace khác không ảnh hưởng.

**Vùng bảo vệ:** không (meta-client ngoài danh sách CLAUDE.md; CODEOWNERS yêu cầu PM duyệt).

**PM kiểm tra:** `pnpm test` xanh.

## [008] Workspace, thành viên, lời mời, Cài đặt; E2E — 2026-10-23

**Thay đổi**
- A07 Tạo workspace (tên, múi giờ theo trình duyệt, tiền tệ báo cáo); A06 Chấp nhận lời mời: người mới đặt họ tên + mật khẩu (email được mời coi như đã xác minh), người đã có tài khoản đăng nhập để chấp nhận, đăng nhập sai tài khoản được cảnh báo; A06 · hết hạn.
- Cài đặt: thanh tab dùng chung theo vai trò (owner: Workspace · Thành viên · Gói & thanh toán · Thông báo · Hồ sơ; manager: Thành viên · Thông báo · Hồ sơ; buyer: Thông báo · Hồ sơ; Guardrails chỉ khi P2 bật).
  - ST01: tên, múi giờ, ngôn ngữ, logo (PNG/SVG ≤ 1MB, kiểm theo nội dung file, SVG có script/handler/link ngoài bị từ chối), màu chủ đạo, email gửi báo cáo (cảnh báo domain chưa xác minh), xóa workspace (nhập đúng tên).
  - ST02: bảng thành viên + lời mời đang chờ (Gửi lại), mời thành viên (email, vai trò, Client), sửa vai trò/Client/quyền duyệt theo Client (cột "Duyệt hành động" chỉ khi P2 bật), xóa thành viên, chuyển quyền owner cho manager (xác nhận bằng mật khẩu); trạng thái trống.
  - ST06: họ tên, ngôn ngữ, đổi mật khẩu (cần mật khẩu hiện tại, đăng xuất phiên khác), đăng xuất mọi thiết bị khác.
  - ST03, ST05: khung tạm (feature 026, 023).
- Email qua SMTP (ADR-0004, nodemailer): Mailpit ở local, Resend SMTP ở staging/production; email mời E02 bản đầu (song ngữ, escape dữ liệu người dùng).
- Supabase Storage: bucket `brand` (công khai, PNG/SVG ≤ 1MB), `reports` (riêng tư), `creatives` (riêng tư).
- Schema: `workspaces.default_currency`, `workspaces.report_from_email`.
- `pnpm seed:staff -- --email … --password … [--can-enable-flags]`: tạo tài khoản đội AdxLens ở local (từ chối chạy ở production).
- **Quyết định PM 23/10/2026:** A01 báo "Email này đã có tài khoản…" như Penpot (ADR-0003 cập nhật). Test cũ "không tiết lộ email" được đổi theo yêu cầu mới (CLAUDE.md quy tắc 8: lý do ghi tại đây).
- Sửa lỗi phát hiện qua E2E: kích thước giao diện nhỏ hơn thiết kế (root font-size 13px làm spacing rem co lại); múi giờ mặc định lấy theo máy chủ thay vì trình duyệt; tên múi giờ cũ `Asia/Saigon` được chuẩn hóa thành `Asia/Ho_Chi_Minh`; A06 báo "tất cả Client" cho buyer chưa được gán; nhãn "Đã mời sau 1 giây nữa" do lệch đồng hồ.
- `route()`: chỉ đọc body JSON khi route có schema (route upload tự đọc multipart); `uuidParam()` cho id sai định dạng trả 404 thay vì 500; mật khẩu xác nhận lại qua `verifyPassword` (thay được trong test, không có đường tắt theo APP_ENV).
- Bộ test cách ly: probe cho 16 route mới; mỗi probe băm dữ liệu workspace B trước/sau và phải không đổi.
- E2E Playwright (`pnpm test:e2e`) + job CI `e2e` (Supabase CLI trên runner).

**Test tự động**
- `apps/web/src/app/api/v1/settings.test.ts` (15): mời (email có link, DB chỉ lưu hash), manager không mời được, không mời vai trò owner, gửi lại đổi token, id sai → 404, đổi vai trò/không đổi owner, chuyển quyền cần đúng mật khẩu, tạo workspace + cookie, múi giờ sai, màu/email gửi báo cáo, xóa workspace (quyền + tên), logo PNG/sai loại/SVG độc/quá 1MB, đổi mật khẩu.
- `packages/core/src/notification/email.test.ts` (2), `apps/web/src/server/storage.test.ts` (3), `apps/web/src/lib/settings-tabs.test.ts` (3), `apps/web/src/lib/timezone.test.ts` (4), tenancy: thêm A06 buyer/manager, chi tiết lời mời.
- `apps/web/e2e/auth-workspace.spec.ts` (4): M01/M02 + đổi ngôn ngữ; F1 đăng ký → email Mailpit → xác minh → tạo workspace → sidebar ẩn mục P1/P2 → ST01 lưu (múi giờ theo trình duyệt) → ST02 mời → email mời → đăng xuất X07 → A06 người mới → buyer không thấy Báo cáo/Kết nối; A03 sai mật khẩu còn 4 lần; A01 email đã có tài khoản.

**Vùng bảo vệ:** `packages/db/**` (cột workspace), `infra/**` (bucket Storage).

**PM kiểm tra:** `pnpm exec supabase stop --workdir infra` rồi `pnpm dev`; `pnpm seed:staff -- --email pm@adxlens.local --password "mat-khau-pm-10" --can-enable-flags`; đăng ký tài khoản mới ở `/signup`, mở Mailpit http://127.0.0.1:54324; thử mời thành viên ở Cài đặt › Thành viên, mở email mời ở Mailpit trong cửa sổ ẩn danh.

## [007] Xác thực A01–A05 — 2026-10-22

**Thay đổi**
- ADR-0003 (xác thực, landing, workspace) và bổ sung L3 mục 3 (route group `(marketing)`, `(auth)`, `(app)`).
- Supabase Auth email + mật khẩu, bắt buộc xác minh email; mật khẩu ≥ 10 ký tự (theo Penpot A01/A05; config Supabase đồng bộ).
- A01 Đăng ký (họ tên, email công việc, mật khẩu, đồng ý điều khoản), A02 Kiểm tra email (gửi lại sau 60 giây), A03 Đăng nhập, A04 Quên mật khẩu, A05 Đặt lại mật khẩu (hết hạn sau 60 phút → màn "hết hạn"; đặt lại xong đăng xuất các phiên khác), `/auth/callback` (đổi mã PKCE, đồng bộ hồ sơ, chuyển tới tạo workspace nếu chưa có).
- Không tiết lộ email đã tồn tại: đăng ký luôn chuyển tới A02; quên mật khẩu luôn báo "đã gửi nếu email tồn tại"; sai email hay sai mật khẩu cùng một thông điệp.
- Khóa đăng nhập tạm 15 phút sau 5 lần sai (Penpot A03 · lỗi), đếm theo hash email (bảng `app.auth_throttle`, không lưu email rõ, RLS không policy).
- Chuyển hướng sau đăng nhập chỉ nhận đường dẫn nội bộ.
- **Lệch so với Penpot (chờ PM chốt):** khung "A01 · lỗi" hiện "Email này đã có tài khoản"; bản code theo PROMPTS (không tiết lộ email đã tồn tại).

**Test tự động**
- `apps/web/src/server/auth-flows.test.ts` (21): chuẩn hóa email, không tiết lộ email đã tồn tại, mật khẩu < 10 ký tự, bắt buộc điều khoản, lỗi đăng nhập chung chung, đếm lần thử và khóa (khi khóa không gọi Supabase), email chưa xác minh, `next` nội bộ, quên mật khẩu luôn "đã gửi", mật khẩu nhập lại sai, link hết hạn, cửa sổ 60 phút, 7 trường hợp `safeNext` (gồm `//`, `/\`, URL ngoài, `javascript:`, CRLF).
- `packages/core/src/tenancy/auth-throttle.test.ts` (3): khóa sau 5 lần/hết khóa đếm lại, đăng nhập đúng xóa bộ đếm, không lưu email rõ.

**Vùng bảo vệ:** `packages/db/**` (bảng auth_throttle), `infra/**` (config Supabase: mật khẩu 10, OTP 24 giờ).

**PM kiểm tra:** chạy `pnpm exec supabase stop --workdir infra && pnpm dev` (nạp config mới); đăng ký ở `/signup`, mở Mailpit http://127.0.0.1:54324, bấm link xác minh, đăng nhập ở `/login`; nhập sai 5 lần thấy thông báo khóa 15 phút.

## [006] Trang công khai M01–M05, cấu hình gói — 2026-10-22

**Thay đổi**
- `packages/core/billing/plans.ts`: **cấu hình gói duy nhất** (PM sửa tại đây): Free 0 ₫/1 tài khoản, Starter 590.000 ₫/5, Growth 1.490.000 ₫/15, Scale 3.490.000 ₫/40; thêm tài khoản 79.000 ₫/tháng; trả năm giảm 20%; ân hạn 7 ngày; gói mặc định Free; quyền theo gói (gỡ nhãn chỉ Scale; quyền ghi P2 từ Growth — ADR-0001 A5, A6, A8).
- Trang công khai theo Penpot: M01 Landing, M02 Bảng giá (đọc từ cấu hình, gói Growth nổi bật), M03 Quyền riêng tư, M04 Điều khoản, M05 Hướng dẫn xóa dữ liệu có ô tra mã xác nhận. Header/footer chung, đổi ngôn ngữ vi/en không cần đăng nhập.
- Lệch so với Penpot (có chủ đích): M05 đường dẫn "Kết nối › …" (Kết nối không nằm trong tab Cài đặt, ux-requirements 6.7); "trong thời hạn cam kết" → "trong vòng 30 ngày" (ADR-0001 A8).
- `docs/tech-debt.md`: nội dung pháp lý giữ chỗ, link báo cáo mẫu, tra mã xóa dữ liệu, rate limit API.

**Test tự động**
- `packages/core/src/billing/plans.test.ts` (6): gói mặc định Free, quyền ghi từ Growth, chỉ Scale gỡ nhãn, giá năm, ân hạn 7 ngày, giá tăng dần.
- `apps/web/src/app/(marketing)/marketing.test.ts` (3): mỗi gói có chuỗi vi/en, chuỗi giao diện không hard-code giá, mã xóa sai định dạng.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `pnpm dev`, mở http://localhost:3000 (landing), `/pricing`, `/privacy`, `/terms`, `/data-deletion`; đổi ngôn ngữ ở header.

## [005] Khung app web, design system code, bộ test cách ly workspace — 2026-10-22

**Thay đổi**
- ADR-0002: thư viện giao diện (Next.js 15, Tailwind 4, nền shadcn/ui: radix-ui, cva, clsx, tailwind-merge; lucide-react; sonner; @supabase/ssr; next-intl).
- `packages/ui`: token CSS chép từ Penpot (tên giữ nguyên), theme Tailwind, component Button, Badge, Delta (màu theo tốt/xấu, luôn có mũi tên và dấu), Input/Select/Checkbox/Field, Card, PageHeader, KpiStat, SourceFootnote, EmptyState, Skeleton, Banner, Tab/Segmented/FilterChip/NavItem, Table, Dialog, Drawer 480px, Tooltip, Menu.
- `apps/web`: thanh trên toàn chiều ngang theo Penpot O01/X07 (logo + breadcrumb, bộ chọn kỳ toàn cục, chọn workspace, avatar với menu X07: Hồ sơ cá nhân, Thông báo, Ngôn ngữ, Đăng xuất); sidebar 224px 9 mục, 4 mục P1/P2 ẩn hẳn khi cờ tắt, buyer không thấy Báo cáo/Kết nối; trang lỗi X01 404, X02 403, X03 (có mã lỗi), F-state "tính năng chưa bật".
- i18n vi/en bằng next-intl, locale theo cookie/hồ sơ.
- `route()` dùng chung cho mọi API: xác thực Supabase (cookie hoặc Bearer), workspace qua `X-Workspace-Id`/cookie và kiểm thành viên, quyền theo vai trò, cờ kiểm phía server (tắt → 404), validate zod (422 kèm đường dẫn lỗi), lỗi chuẩn `{error:{code,message,details}}`, lỗi lạ → 500 không lộ thông điệp, chặn CSRF theo Origin cho request ghi dùng cookie.
- API: `GET /api/health`, `GET /api/v1/me`, `POST /api/v1/me/workspace`, `POST /api/v1/me/preferences`; `POST /auth/logout`. Middleware làm mới phiên, chặn trang app khi chưa đăng nhập.
- Bộ test cách ly workspace (`tests/isolation`): tự quét mọi `app/api/**/route.ts`; route thiếu probe → test đỏ; gọi bằng ngữ cảnh A, phản hồi không được chứa định danh/tên của B; dùng tài nguyên B phải bị từ chối; giả header workspace B bị từ chối. Job theo workspace: băm dữ liệu B trước/sau khi chạy job A phải không đổi; job thiếu probe → đỏ.
- Logger che thêm thông tin đăng nhập trong URL và token trong query string; lỗi đã serialize vẫn được che.
- CI build web.

**Test tự động**
- `apps/web/src/server/route.test.ts` (9): 401, 400/403 workspace, thành viên, 422, 403 vai trò, cờ tắt → 404 và handler không chạy / cờ bật → chạy, AppError/500 không lộ, CSRF, route staff.
- `tests/isolation/routes.test.ts`, `tests/isolation/jobs.test.ts`.
- `apps/web/src/lib/nav.test.ts` (5), `period.test.ts` (6), `breadcrumb.test.ts` (3), `apps/web/src/i18n/messages.test.ts` (4: cùng khóa, cùng biến, không rỗng, không lộ tên cờ/mã giai đoạn).
- Logger: thêm test URL có mật khẩu, query token, thuộc tính tùy ý của lỗi.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `pnpm --filter @adxlens/web build` xanh. Giao diện xem được sau feature 007 (đăng nhập).

## [004] Logger, danh mục job, vận hành (ops), khung worker — 2026-10-22

**Thay đổi**
- Logger Pino chung (`@adxlens/core/shared`): che token/authorization/password/cookie/body/email theo khóa, che chuỗi dạng token Meta (`EAA…`) và `Bearer …` cả trong message và lỗi; logger con gắn `workspace_id`, `job_id`.
- `packages/jobs`: 11 queue (L3 7.1), 17 job `<queue>:<verb>` với payload zod, idempotency key (L2 9), retry 5 lần backoff mũ 30 giây, cổng `Enqueue` để core không import BullMQ.
- Bảng `app.ops_incidents`, `app.ops_playbook_runs` (RLS bật). `packages/core/ops`: mở sự cố gom theo fingerprint, playbook có giới hạn số lần (L2 11.2; vượt giới hạn → leo thang, playbook lạ không bao giờ chạy), health check đăng ký được, mở sự cố khi kiểm tra lỗi.
- `apps/worker`: BullMQ worker cho mọi queue, dispatch validate payload trước khi gọi handler, lịch `ops:health_check` mỗi 5 phút, kiểm tra backlog queue `sync` (> 100 → sự cố P2).
- Sửa: `TOKEN_ENC_KEY_V2` để trống được coi là chưa cấu hình.
- CI: khóa test sinh ngẫu nhiên mỗi lần chạy; `.gitleaks.toml` bỏ qua file `*.test.ts` (chuỗi giả).

**Test tự động**
- `packages/core/src/shared/logger.test.ts` (5): token trong field lồng nhau, trong message/lỗi, body request, giữ workspace_id/job_id.
- `packages/jobs/src/jobs.test.ts` (4): quy ước tên, workspaceId bắt buộc, validate payload, jobId ổn định.
- `packages/core/src/ops/ops.test.ts` (8): gom sự cố, đếm P1, giới hạn playbook, hết cửa sổ, playbook lỗi, playbook lạ, health check.
- `apps/worker/src/dispatch.test.ts` (3): job lạ, payload sai, health check.
- `packages/config/src/env.test.ts`: thêm test khóa V2 để trống.

**Vùng bảo vệ:** `packages/db/**` (bảng ops).

**PM kiểm tra:** `pnpm test` xanh; `pnpm --filter @adxlens/worker dev` in "worker đã chạy".

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
