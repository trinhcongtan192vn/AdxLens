# Changelog

Mỗi feature merge vào `develop` có một mục: thay đổi gì, test tự động đi kèm, vùng bảo vệ bị chạm, và cách PM kiểm tra thủ công. PM verify trên `develop` trước khi merge `develop → main`.

## [031] Weekly Action List (P101–P102), trạng thái + gán việc, thông báo cho media buyer, checklist cờ P1 — 2026-10-23

**Thay đổi**
- DB: `app.recommendations` (tuần, nguồn, hành động, lý do, bằng chứng, tác động `numeric`, độ tin cậy, công sức, điểm, trạng thái Đề xuất / Đang làm / Đã làm / Bỏ qua + lý do, người được gán). RLS (migration 0039–0040).
- `packages/core/recommendation/weekly.ts`: `generateWeeklyActions` (từ phát hiện đang mở + creative Thua/Winner; idempotent, giữ trạng thái), `priorityScore` (PRD 10.3: tác động tương đối × độ tin cậy ÷ công sức × hệ số "sai"), `wrongRates` / `reviewQueue` (loại gợi ý hay bị bỏ qua vì "sai" xếp thấp hơn và vào rà soát), `listWeeklyActions` (buyer chỉ thấy Client được gán), `updateWeeklyAction` (bỏ qua bắt buộc lý do; chỉ gán cho người xem được Client), `assignableMembers`. Bảng giá trị ở `docs/rules/weekly-actions.md`.
- Job `recommend:build` (kiểm cờ ở đầu job); `maintenance:report_tick` enqueue vào thứ Hai 07:00 theo múi giờ workspace.
- Thông báo mới: `weekly_actions` (P1-09: mỗi thành viên nhận số việc theo phạm vi Client của mình, trong app + email) và `action_assigned` (trong app).
- Checklist kỹ thuật cờ `p1_recommendations` (L3 18.3): P0 bật ≥ 14 ngày; tỷ lệ phát hiện "sai" ≤ 20% — hiện trong hộp thoại bật cờ AD02.
- API: `GET /recommendations` (`week`, `status`, `assignee=me`), `PATCH /recommendations/{id}`, `GET /recommendations/{id}/assignees` — đều kiểm cờ ở server.
- Trang P101 `/weekly-actions`: danh sách xếp hạng, lọc trạng thái / "Việc của tôi" / tuần, đổi trạng thái tại chỗ (bỏ qua mở hộp thoại lý do); P102 drawer: vì sao, tác động, độ tin cậy, công sức, cách xếp hạng, gán người, mở Ads Manager.

**Test tự động**
- `recommendation/weekly.test.ts` (10): công thức điểm; tạo + xếp hạng + idempotent giữ trạng thái; bỏ phát hiện đã xong; tuần phải là thứ Hai; **bỏ qua vì "sai" giảm điểm tuần sau (× 0,3) và vào rà soát**; thông báo theo phạm vi Client; bỏ qua cần lý do, đã làm ghi thời điểm, buyer chỉ thấy/sửa việc của mình; gán sai phạm vi bị chặn + thông báo người được gán; cách ly workspace; lịch thứ Hai 07:00; checklist cờ P1.
- `api/v1/recommendations/recommendations.test.ts` (2): **cờ tắt thì không chạy**; cờ bật: danh sách, bỏ qua cần lý do, người nhận việc, lọc "của tôi". Worker: `recommend:build` cờ tắt → không chạy.
- Bộ cách ly: probe 3 route + job `recommend:build`; world B có một gợi ý (tên bí mật không lộ).
- E2E `creatives.spec.ts` (+ P101/P102): tạo danh sách → đổi trạng thái → mở chi tiết.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0039–0040).

**PM kiểm tra:** bật cờ "Gợi ý" → `pnpm job:trigger -- recommend:build '{"workspaceId":"<id>","week":"<thứ Hai tuần này>"}'` → sidebar "Việc tuần này": đổi trạng thái, bỏ qua (chọn lý do), mở chi tiết, gán người. Email "Việc tuần này" ở Mailpit.

## [030] Creative library (P103), so sánh creative (P104), phân loại + dự báo mệt — 2026-10-23

**Thay đổi**
- Module mới `packages/core/recommendation` (P1). `creativeLibrary`: gom ad theo creative gốc trong một tài khoản (thumbnail, định dạng, số ad, thời gian chạy, chi tiêu, kết quả, CPA, CTR, ROAS, tần suất); phân loại **Winner / Cần theo dõi / Đang mệt / Thua / Chưa đủ dữ liệu** kèm lý do; "Đang mệt" dùng **đúng ngưỡng của rule `creative_fatigue`** (một nguồn, có test khóa); dự báo mệt (hồi quy CTR 14 ngày, ghi rõ là dự báo). `compareCreatives`: 2–4 creative, chỉ số + chuỗi theo ngày. Quy tắc công khai ở `docs/rules/creatives.md`.
- Buyer chỉ xem tài khoản của Client được gán; tài khoản workspace khác → 404.
- API `GET /creatives`, `GET /creatives/compare` — kiểm cờ `p1_recommendations` ở server.
- Trang P103 `/creatives` (chọn tài khoản, lọc theo nhãn, bảng / lưới, chọn creative để so sánh) và P104 `/creatives/compare` (bảng chỉ số cạnh nhau, biểu đồ CTR và chi tiêu). Mục "Creative" ở sidebar chỉ hiện khi cờ bật; mở thẳng URL khi cờ tắt → trang "tính năng chưa bật".
- Không cần migration (dùng `analytics.entities` + `insights_daily` sẵn có).

**Test tự động**
- `recommendation/creatives.test.ts` (10): ngưỡng mệt trùng rule; gom 2 ad cùng creative; Winner/Theo dõi/Thua theo trung vị; **không đủ dữ liệu thì không xếp** (ít hiển thị, ít creative cùng loại); Đang mệt; buyer không được Client → 404; cách ly workspace; dự báo (giảm đều, đã chạm ngưỡng, ổn định, tăng, thiếu ngày); so sánh 2–4.
- `api/v1/creatives/creatives.test.ts` (2): **cờ tắt thì không chạy** (404); cờ bật trả dữ liệu, so sánh 1 creative → 422. `lib/creatives.test.ts`: đọc `ids` an toàn.
- Bộ cách ly: probe 2 route; world B có creative + ad (tên/ảnh bí mật không lộ); A bật thêm `p1_recommendations` để probe chạy hết logic.
- E2E mới `creatives.spec.ts`: dữ liệu mẫu → cờ tắt không có mục Creative, URL → "chưa bật" → PM bật Báo cáo + Gợi ý (vượt checklist có log) → P103 → chọn 2 → P104.

**Vùng bảo vệ:** không.

**PM kiểm tra:** bật cờ "Gợi ý" cho workspace (AD02) → sidebar "Creative" → lọc theo nhãn, đổi Bảng/Lưới, rê chuột vào nhãn xem lý do → chọn 2 creative → "So sánh".

## [029] Trang hoà vốn công khai M06 — 2026-10-23

**Thay đổi**
- `packages/core/billing/break-even.ts`: công thức PRD 13.3 — tài khoản × giờ tiết kiệm mỗi tài khoản × giá giờ, so với phí gói rẻ nhất đủ số tài khoản (vượt Scale thì cộng phí tài khoản thêm); tiền tính BigInt; giá giờ hoà vốn làm tròn lên. Giá gói đọc từ `app.billing_plans`.
- Trang `/break-even` (M06): công khai, không gắn cờ (ADR-0001 B7), form GET tính ở server; link từ M02. Song ngữ.
- Tech-debt: mặc định 6 giờ / 150.000đ là giả định, cần PM chốt và so khung Penpot M06.

**Test tự động**
- `billing/break-even.test.ts` (3): chọn gói đúng theo số tài khoản, giá trị, chênh lệch, giá giờ hoà vốn; vượt Scale cộng tài khoản thêm; lỗ ròng âm; 0 giờ không chia cho 0.
- E2E `billing.spec.ts` (+1): M02 → M06, mặc định Starter, đổi số liệu → tính lại, chênh lệch âm.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `/pricing` → "Trang hoà vốn" → đổi số tài khoản / giờ / giá giờ → "Tính".

## [028] Cổng thanh toán VN — PayOS (sandbox): thanh toán theo kỳ, webhook, gia hạn, nhắc gia hạn — 2026-10-23

**Thay đổi**
- DB: `app.payment_orders` (đơn theo kỳ: `order_code` số do DB cấp, gói, kỳ, số tiền VND `numeric`, trạng thái, link). RLS (migration 0037–0038).
- `packages/core/billing/payos.ts`: PayOS REST bằng `fetch`; `payosSignature` (HMAC-SHA256, khóa xếp chữ cái), `verifyPayosWebhook`; `periodAmountVnd` (BigInt; năm = 12 × 80% làm tròn nghìn); `startPayosCheckout` (chỉ owner; chặn khi đang trả qua Stripe); `applyPaidOrder` — **số tiền phải khớp đơn**, chỉ đơn `pending`, gia hạn từ max(bây giờ, hết kỳ hiện tại) + 1 tháng / 12 tháng, gọi lặp không gia hạn hai lần; `confirmPayosOrder` (ST04 tra trạng thái đơn trên PayOS bằng khóa AdxLens, không tin query trên URL).
- `billing/cancel.ts`: hủy / tiếp tục gói cho cả Stripe và PayOS (route `/billing/cancel` dùng chung).
- `core/ops/billing-webhooks.ts` → `handlePayosWebhook` (tìm workspace theo mã đơn — xuyên workspace có chú thích; webhook thử của PayOS trả 200). `core/ops/billing-renewals.ts` → `runPayosRenewals` trong `maintenance:daily_tick`: nhắc gia hạn trước 7 và 1 ngày (loại thông báo mới `billing_renewal`, bắt buộc, có email); hết kỳ chưa trả → `past_due` từ ngày hết kỳ (ân hạn 7 ngày → Free); đã hủy cuối kỳ → `canceled`.
- API: `POST /billing/checkout` thêm `method: stripe | payos`; `POST /webhooks/payos`.
- Giao diện: ST03 chọn phương thức (QR / chuyển khoản VND — mặc định; thẻ quốc tế), nút "Gia hạn" cho gói PayOS, "Quản lý thanh toán" chỉ với Stripe; ST04 hiện "đã nhận thanh toán … tới ngày …" / "chưa nhận". Banner X04 past_due đổi lời cho cả hai cổng ("Chưa thanh toán kỳ hiện tại…").
- `docs/onboarding.md` mục 7. Tech-debt: đổi gói giữa kỳ chưa tính chênh lệch.

**Test tự động**
- `billing/payos.test.ts` (13): chữ ký đúng chuẩn PayOS; webhook sửa số tiền / sai khóa bị từ chối; số tiền kỳ; tạo đơn → webhook → active 1 tháng, lặp không gia hạn hai lần; gia hạn sớm cộng từ hết kỳ, kỳ năm; số tiền lệch không ghi nhận, mã lỗi bỏ qua, đơn lạ; ST04 tra cứu PAID/CANCELLED; **cách ly đơn giữa workspace**; chặn khi đang dùng Stripe; nhắc 7/1 ngày mỗi mốc một lần; hết kỳ → quá hạn → Free → trả lại active; hủy cuối kỳ → Free không nhắc; hủy khi Free → 409.
- `billing.test.ts` (+1): checkout PayOS, webhook chữ ký sai 400 / đúng áp gói / lặp không gia hạn.
- **Test đổi:** `apps/worker/src/dispatch.test.ts` — kết quả `maintenance:daily_tick` nay có thêm `renewals`; kỳ vọng được mở rộng thêm trường này (giữ nguyên các trường cũ), không nới.
- Bộ cách ly: probe `POST /webhooks/payos`; world B có đơn PayOS (link bí mật không được lộ). `installTestServer` cài PayOS giả.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0037–0038).

**PM kiểm tra:** cần khóa PayOS thử nghiệm — `docs/onboarding.md` mục 7: chọn Growth bằng QR → thanh toán → ST04 báo đã nhận, ST03 hiện ngày hết kỳ; `pnpm job:trigger -- maintenance:daily_tick '{"tick":"manual"}'` khi gần hết kỳ → thông báo "Nhắc gia hạn gói".

## [027] Thanh toán Stripe (test mode): checkout, cổng tự phục vụ, webhook, past_due, hủy gói, thông tin hóa đơn — 2026-10-23

**Thay đổi**
- DB: `app.billing_events` (chống xử lý webhook trùng, unique theo nhà cung cấp + mã sự kiện), `app.billing_profiles` (tên công ty, MST, địa chỉ, email hóa đơn). RLS (migration 0035–0036).
- `packages/core/billing/stripe.ts`: Stripe REST bằng `fetch` (không thêm thư viện); số tiền tính bằng BigInt (USD theo cent nếu gói có giá USD, không thì VND; năm = 12 × 80%); `startStripeCheckout` (metadata workspace + gói, chỉ owner), `openStripePortal`, `setStripeCancel` (hủy/tiếp tục cuối kỳ); `verifyStripeSignature` (HMAC-SHA256, so sánh hằng thời gian, lệch tối đa 5 phút); `applyStripeEvent`: `checkout.session.completed` → gói active; `customer.subscription.updated` → trạng thái, ngày gia hạn, hủy cuối kỳ; `deleted` → Free; `invoice.payment_failed` → past_due (mở ân hạn 7 ngày, giữ mốc cũ khi lặp) + thông báo/E05 cho owner một lần; `invoice.paid` → active.
- `packages/core/ops/billing-webhooks.ts`: tìm workspace theo mã subscription/customer Stripe (ưu tiên) hoặc metadata — truy vấn xuyên workspace có chú thích; xử lý trong transaction, mỗi sự kiện một lần.
- `billing/profile.ts`: thông tin xuất hóa đơn (zod: MST chỉ số và gạch).
- API: `POST /billing/checkout`, `POST /billing/portal`, `POST /billing/cancel`, `GET|PUT /billing/profile` (owner), `POST /webhooks/stripe` (chữ ký trên body thô). Chưa cấu hình khóa → 503 `SERVICE_UNAVAILABLE` (mã lỗi mới).
- Giao diện ST03: "Đổi gói" (tháng/năm) → Stripe Checkout; "Quản lý thanh toán"; "Hủy gói"/"Tiếp tục gói"; form thông tin xuất hóa đơn. ST04 `/settings/billing/checkout?status=success|cancel` (không tự đổi gói theo query — chờ webhook).
- `docs/onboarding.md` mục 6: chạy thanh toán thử với Stripe CLI. Tech-debt: phí tài khoản vượt hạn mức, hóa đơn VAT điện tử.

**Test tự động**
- `billing/stripe.test.ts` (14): chữ ký (đúng / sai secret / body sửa / quá 5 phút / header hỏng); số tiền USD/VND tháng/năm; checkout mang metadata + giá từ DB; chỉ owner; cổng + hủy cuối kỳ; webhook áp gói và **idempotent**; updated/deleted; payment_failed → past_due, một thông báo + một email, giữ mốc ân hạn, paid → active; invoice dạng API mới; workspace không xác định; **cách ly: sự kiện của B không chạm A kể cả khi metadata trỏ A**; thông tin hóa đơn.
- E2E mới `billing.spec.ts`: ST03 Free 0/1, lưu thông tin hóa đơn, ST04 hủy.
- `apps/web/.../billing.test.ts` (4): checkout owner/manager; hủy khi Free → 409; profile 200/422; webhook chữ ký sai 400 không đổi gói, đúng thì áp.
- Bộ cách ly: probe 5 route mới; world B có subscription Stripe + thông tin hóa đơn (chuỗi bí mật không được lộ). `installTestServer` cài Stripe giả (test route không gọi mạng; không đổi assertion nào).

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS, migration 0035–0036).

**PM kiểm tra:** cần khóa Stripe **test** — làm theo `docs/onboarding.md` mục 6: chọn gói Growth → thẻ 4242 → ST04 báo thành công, ST03 hiện Growth; `stripe trigger invoice.payment_failed` → banner đỏ + email; "Hủy gói" → hiện "Kết thúc ngày …".

## [026] Gói cấu hình trong DB, đếm tài khoản đang hoạt động, vượt hạn mức + ân hạn — 2026-10-23

**Thay đổi**
- DB: `app.billing_plans` (giá VND `numeric`, hạn mức tài khoản, giá tài khoản thêm, quyền theo gói; bảng toàn hệ thống, RLS bật không policy) và `app.subscriptions` (gói theo workspace, trạng thái `active|past_due|canceled`, kỳ, nhà cung cấp thanh toán, mốc `past_due_since` / `over_limit_since`). Seed 4 gói theo PRD 13.3 (migration 0033–0034). **PM đổi giá bằng cách sửa dòng trong `app.billing_plans`**; code chỉ dùng giá mặc định khi thiếu dòng.
- `packages/core/billing/service.ts`: `getPlans`, `activeAccountCount` (chi tiêu 30 ngày; không tính tài khoản mẫu và kết nối đã thu hồi), `billingStatus` (gói đăng ký / gói đang hưởng quyền, vượt hạn mức, ân hạn 7 ngày — ADR-0001 A8), `currentPlanKey(ctx)` (thay stub Free; bỏ mục tech-debt), `hasPlanEntitlement`, `showPoweredBy`, `refreshOverLimit`, `syncableAccountIds`, `setSubscription` (027/028 dùng).
- Quy tắc: `past_due` quá 7 ngày hoặc gói đã hủy → quyền về Free. Vượt hạn mức → ghi mốc, đồng bộ bình thường trong 7 ngày; hết ân hạn → **đồng bộ hằng ngày chỉ chạy cho số tài khoản trong hạn mức (nhập sớm nhất)**, dữ liệu cũ giữ nguyên. Hết vượt → xóa mốc.
- Đồng bộ hằng ngày (`runDailySync`) cập nhật mốc vượt hạn mức và bỏ qua tài khoản ngoài hạn mức (`skipped / plan_limit`).
- Nhãn "Powered by" ở share link và PDF: ẩn khi gói có quyền `remove_badge` (Scale) hoặc workspace được gỡ thủ công.
- Giao diện: S04 hạn mức theo gói thật; M02 bảng giá đọc từ DB; X04 thêm biến thể **thanh toán thất bại** và **vượt hạn mức** (trong ân hạn / hết ân hạn), link tới Gói & thanh toán cho người có quyền; ST03 hiện gói, giá, tài khoản đang hoạt động / hạn mức, ngày gia hạn và cảnh báo ân hạn (thanh toán ở 027–028).

**Test tự động**
- `billing/service.test.ts` (11): giá từ DB và fallback; gói không active về mặc định; đếm tài khoản đúng (bỏ mẫu, thu hồi, workspace khác); Free mặc định, đổi gói đổi quyền; past_due giữ gói 7 ngày rồi về Free; gói hủy về Free; nhãn Powered by; vượt hạn mức ghi mốc một lần, trong ân hạn không giới hạn, hết ân hạn chỉ giữ tài khoản sớm nhất; hết vượt thì xóa mốc.
- `ingestion.test.ts` (+2): hết ân hạn → tài khoản ngoài hạn mức bỏ qua đồng bộ, tài khoản trong hạn mức vẫn chạy; vượt lần đầu ghi mốc và vẫn đồng bộ.
- Bộ cách ly: world B có subscription (past_due, vượt hạn mức) — vân tay B không đổi khi chạy route/job của A.

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS + seed, migration 0033–0034).

**PM kiểm tra:** Cài đặt → Gói & thanh toán hiện Free, "x/1" tài khoản. Nhập ≥ 2 tài khoản có chi tiêu → banner vượt hạn mức. Đổi giá một gói trong `app.billing_plans` (Supabase Studio) → `/pricing` hiện giá mới.

## [025] Tài khoản mẫu (S01), banner dữ liệu mẫu (X04), báo cáo mẫu `/r/demo` — 2026-10-23

**Thay đổi**
- DB: `meta_connections.is_demo`, `clients.is_demo`; trigger chặn share link thêm điều kiện **dữ liệu mẫu** (migration 0031–0032).
- `packages/core/connections/demo.ts` (PRD P0-02): "Dùng tài khoản mẫu" tạo kết nối mẫu + 2 tài khoản QC (một khớp số liệu, một có ngày lệch để thấy luồng đối chiếu) + 2 Client mẫu đã xác nhận, bắt đầu backfill; gọi lại không tạo thêm. **Kết nối mẫu luôn đọc dữ liệu giả** (`metaFor`) ở đồng bộ, đối chiếu, làm mới tài khoản — không bao giờ gọi Meta thật. "Xóa dữ liệu mẫu" xóa kết nối (cascade số liệu) và Client mẫu, giữ Client thật.
- Báo cáo từ dữ liệu mẫu ghi `demo` và mẫu báo cáo hiện dòng "Báo cáo mẫu — số liệu minh họa"; **không chia sẻ / không xuất PDF / lịch gửi hoãn** (lý do "Client dùng dữ liệu mẫu").
- API `POST|DELETE /api/v1/demo`. Trang S01 `/demo` (từ S03 "Xem tài khoản mẫu trước"): giải thích + "Dùng tài khoản mẫu" → S06. Banner hệ thống X04 biến thể dữ liệu mẫu ("Kết nối tài khoản thật", "Xóa dữ liệu mẫu").
- `/r/demo`: báo cáo mẫu công khai (số liệu cố định, ghi rõ là mẫu) cho nút "Xem báo cáo mẫu" ở trang chủ. Bỏ mục `/r/demo` trong `docs/tech-debt.md`.
- Ghi chú cho 026: tài khoản mẫu không tính vào số tài khoản đang hoạt động khi tính phí.

**Test tự động**
- `packages/core/src/connections/demo.test.ts` (4): tạo đủ + idempotent; đồng bộ kết nối mẫu thành công **dù Meta thật lỗi** (chứng minh không gọi Meta); báo cáo mẫu đánh dấu `demo` và 422 khi chia sẻ; xóa dữ liệu mẫu giữ Client thật.
- `report-view.test.tsx` (+1): dòng "Báo cáo mẫu". Bộ cách ly: probe 2 route demo.
- E2E mới `demo.spec.ts`: S03 → S01 → dùng tài khoản mẫu → S06 xong → Clients có banner + Client mẫu → xóa → trống; `/r/demo` có dòng "Báo cáo mẫu".

**Vùng bảo vệ:** `packages/db/**` (2 cột + cập nhật trigger chặn chia sẻ), `packages/core/connections/**` (kết nối mẫu dùng token giả mã hóa như thường; không chạm logic token thật).

**PM kiểm tra:** Kết nối → "Xem tài khoản mẫu trước" → "Dùng tài khoản mẫu" → banner dữ liệu mẫu trên mọi trang → "Xóa dữ liệu mẫu". Trang chủ → "Xem báo cáo mẫu".

## [024b] Digest tuần (E03), lệnh kích hoạt job cho dev — 2026-10-23

**Thay đổi**
- DB: `app.health_snapshots` (health theo tài khoản × tuần) để digest so "thay đổi sức khỏe" với tuần trước. RLS.
- `packages/core/reporting/digest.ts` (PRD P0-19): gửi thứ Hai 08:00 theo múi giờ workspace cho từng owner/manager **theo phạm vi Client của họ**: health hiện tại + thay đổi so tuần trước, vấn đề mới trong 7 ngày (số mức cao), số ngày lệch đối chiếu, số báo cáo khách được lên lịch trong tuần. Chụp health tuần này mỗi lần chạy. Tôn trọng cài đặt "Tổng kết tuần" (mặc định email, không trong app); chống gửi trùng theo tuần. Email E03 song ngữ, bảng theo tài khoản (health thấp trước). Không có văn bản do LLM.
- `notify()` thêm `forceRecord` (lưu dòng chống trùng cho email gửi riêng).
- Worker: `notify:digest` (kiểm cờ `p0_reports` ở đầu job); `maintenance:report_tick` mỗi giờ cũng enqueue digest cho workspace đang thứ Hai 08:00. `core/ops/report-schedules.ts`: múi giờ mọi workspace (xuyên workspace có chú thích).
- `pnpm job:trigger -- <job> '<payload JSON>'`: kích hoạt job ngay ở dev/staging (kiểm payload theo schema, chặn production). Hướng dẫn trong `docs/onboarding.md`. ESLint cho phép `console` trong `src/cli/`.

**Test tự động**
- `digest.test.ts` (3): thời điểm thứ Hai 08:00 theo múi giờ; gửi owner + manager giới hạn Client (manager không thấy tài khoản Client khác), chụp health, không gửi trùng, tuần sau hiện thay đổi; tắt email thì không gửi.
- Worker: `notify:digest` cờ tắt → không gửi. Bộ cách ly: probe job `notify:digest` cho A không đổi dữ liệu B.
- Kiểm thủ công: `pnpm job:trigger` enqueue job hợp lệ, từ chối payload sai.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0029–0030).

**PM kiểm tra:** `pnpm job:trigger -- notify:digest '{"workspaceId":"<id>","week":"<thứ Hai tuần này>"}'` (cờ báo cáo bật) → Mailpit có email "Tổng kết tuần".

## [024a] Lịch gửi báo cáo (R05): tự động / cần duyệt, hoãn khi chưa toàn vẹn, PDF đính kèm — 2026-10-23

**Thay đổi**
- DB: `app.report_schedules` (Client, hằng tuần theo thứ / hằng tháng ngày 1–28, giờ gửi theo múi giờ của lịch, tự động / cần duyệt, link / link + PDF, ngôn ngữ, người nhận), `app.report_deliveries` (mỗi lần chạy theo kỳ `2026-W43` / `2026-10`, duy nhất theo lịch + kỳ). RLS.
- `packages/core/reporting/schedule.ts` (PRD P0-17, P0-24): kiểm cấu hình (email chuẩn hóa + bỏ trùng, ≤ 10; múi giờ hợp lệ), kỳ = tuần trước (thứ Hai–Chủ nhật) hoặc tháng trước theo múi giờ của lịch, `isDue` theo giờ địa phương. `runSchedule`: dựng báo cáo kỳ ngay trong job (không LLM số), kiểm toàn vẹn → **hoãn** (chưa xác nhận gán / lệch > 1% / kết nối ngắt / không dựng được) và báo account manager kèm lý do (bắt buộc, có email); cần duyệt → chờ duyệt + báo người lập lịch; tự động → link công khai hạn 30 ngày gửi từng người nhận (E04, tên agency, reply-to email báo cáo của agency, PDF đính kèm khi chọn) + báo "đã gửi". Idempotent theo kỳ. `approveDelivery` → đánh dấu đã duyệt và enqueue gửi lại (job kiểm toàn vẹn lần nữa, dùng lại báo cáo đã dựng).
- Email hỗ trợ tệp đính kèm. Loại thông báo mới `report_needs_approval`; lý do hoãn hiển thị bằng chữ (vi/en).
- Worker: `notify:scheduled_report` (kiểm cờ `p0_reports` ở đầu job; PDF qua trang in ký 10 phút), `maintenance:report_tick` mỗi giờ (lịch đến giờ → enqueue kỳ vừa kết thúc). `core/ops/report-schedules.ts` liệt kê lịch đang bật xuyên workspace (có chú thích lý do).
- API (cờ `p0_reports`): `GET|POST /api/v1/report-schedules`, `PATCH|DELETE /api/v1/report-schedules/{id}`, `POST /api/v1/report-deliveries/{id}/approve`.
- Giao diện R05 `/reports/schedules`: danh sách lịch (mô tả lịch, cách gửi, người nhận, lần gửi gần đây với trạng thái + lý do, "Duyệt & gửi"), thêm/sửa/xóa, trống. Nút "Lịch gửi" ở R01.

**Test tự động**
- `schedule.test.ts` (7): giờ chạy/kỳ tuần & tháng + múi giờ; kiểm cấu hình; tự động gửi đúng người nhận + link 30 ngày + thông báo + chạy lại bỏ qua; PDF đính kèm; chưa xác nhận gán → hoãn, không gửi khách, không tạo link, báo kèm lý do; cần duyệt → duyệt → gửi, không dựng lần hai.
- API `schedules.test.ts` (2): cờ tắt 404; tạo/danh sách/sửa/xóa, buyer 403, dữ liệu sai 422.
- Bộ cách ly: dữ liệu B có lịch + lần gửi; probe 5 route (+ tài nguyên B) và job `notify:scheduled_report` dùng lịch B.
- **Test đổi:** `apps/web/src/i18n/messages.test.ts` — hàm lấy biến nội suy trước coi chữ trong nhánh ICU `select` là biến (ví dụ `{có…}`); nay chỉ lấy biến thật (`{ten}` / `{ten, …}`). Ý nghĩa kiểm tra giữ nguyên.

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS, migration 0027–0028).

**PM kiểm tra:** (cờ báo cáo bật) Báo cáo → Lịch gửi → thêm lịch "Cần duyệt", giờ hiện tại → trong vòng 1 giờ (hoặc lệnh kích hoạt ở 024b) có lần gửi "Chờ duyệt" → Duyệt & gửi → Mailpit có email khách.

## [023] Thông báo: trung tâm thông báo (X05), cài đặt (ST05), email theo loại, E01 song ngữ — 2026-10-23

**Thay đổi**
- DB: `app.notifications` (một dòng mỗi người nhận, khóa i18n + tham số, link, đã đọc, trạng thái email, khóa chống trùng), `app.notification_settings` (theo người dùng × loại). RLS.
- `packages/core/notification/service.ts` (PRD P0-25): loại thông báo `sync_done`, `reconciliation_warning`, `token_expiring`, `token_expired`, `report_viewed`, `report_sent`, `report_postponed`, `billing_failed`, `action_failed`. **Loại bắt buộc** (sự cố số liệu, token, thanh toán, hành động thất bại, báo cáo bị hoãn) luôn bật cả trong app và email. `notify()` chọn người nhận theo vai trò + quyền xem Client (manager giới hạn Client khác, buyer không thuộc vai trò bị loại), theo cài đặt, chống trùng theo sự kiện, enqueue `notify:send_email`. Gửi email theo locale người nhận, ghi trạng thái. Danh sách, số chưa đọc, đánh dấu đã đọc (chỉ của mình), cài đặt.
- Mẫu email theo loại (vi/en, cùng nội dung với trung tâm thông báo) `templates/alerts.ts`; E06 token dùng playbook có sẵn + thêm vào trung tâm thông báo.
- Sự kiện đã nối: backfill xong → "đồng bộ xong"; đối chiếu lệch → người phụ trách (bắt buộc, có email); token sắp/đã hết hạn → trung tâm thông báo; khách mở link báo cáo lần đầu → người tạo link. (`report_sent`/`report_postponed` ở 024, `billing_failed` ở 027, `action_failed` ở 036.)
- Worker `notify:send_email`.
- API: `GET|POST /api/v1/notifications` (danh sách đã dịch + chưa đọc / đọc tất cả), `POST /api/v1/notifications/{id}/read`, `GET|PATCH /api/v1/me/notification-settings`.
- Giao diện: X05 `/notifications` (chưa đọc nổi bật, bấm mở + đánh dấu đã đọc, đọc tất cả, trống); số chưa đọc thật trên menu tài khoản; ST05 Cài đặt › Thông báo (bảng loại × trong app / email, loại bắt buộc "Luôn bật" không tắt được).
- E01: mẫu email xác minh và đặt lại mật khẩu song ngữ của Supabase Auth (`infra/supabase/templates/`, cấu hình trong `config.toml`).

**Test tự động**
- `packages/core/src/notification/notification.test.ts` (4): người nhận theo vai trò + quyền Client, email chỉ khi bật, chống trùng; cài đặt thường/bắt buộc, `email: false`; gửi email theo locale + trạng thái + không gửi lại; đánh dấu đọc chỉ của mình; mọi loại có mẫu email.
- Thêm khẳng định vào test luồng: backfill xong có 1 thông báo; đối chiếu lệch có thông báo (email queued) và chạy lại không báo trùng; khách mở link 2 lần → 1 thông báo; playbook token tạo thông báo trong app.
- API `notifications.test.ts` (3): danh sách đã dịch/đọc/đọc tất cả; cài đặt; mọi loại có nhãn/tiêu đề/nội dung vi+en.
- Bộ cách ly: dữ liệu B có thông báo; probe 5 route + job `notify:send_email` dùng thông báo B.
- E2E: đăng ký đi qua mẫu email xác minh mới.
- **Test đổi:** `reconciliation.test.ts` — trước khẳng định `enqueue` đúng 1 lệnh (job đồng bộ lại); nay đối chiếu lệch còn enqueue email thông báo, nên lọc theo tên job (vẫn đúng 1 job đồng bộ lại, và đúng 1 email sau 2 lần chạy).

**Vùng bảo vệ:** `packages/db/**` (2 bảng + RLS, migration 0025–0026), `infra/**` (mẫu email Supabase Auth + cấu hình template). Rủi ro: cần khởi động lại Supabase local để nạp mẫu; staging cấu hình mẫu tương ứng trên Supabase dashboard.

**PM kiểm tra:** Thông báo trên menu tài khoản sau khi đồng bộ; Cài đặt › Thông báo bật email "Đồng bộ xong" → lần sau có email ở Mailpit; email xác minh khi đăng ký có hai ngôn ngữ.

## [042] Trang nội bộ bật/tắt cờ (AD01, AD02) + E2E báo cáo đầy đủ — 2026-10-23

**Thay đổi**
- Trang nội bộ `/admin` (chỉ đội AdxLens; người khác thấy 404, không lộ có trang admin): khung "AdxLens Admin · Nội bộ", email + PM/Staff.
- AD01 `/admin/flags`: ma trận workspace × cờ (owner, số tài khoản QC, ngày tạo, tìm theo tên), bấm ô để bật/tắt.
- AD02 (hộp thoại): chạy checklist kỹ thuật tự động; bật chỉ PM (`can_enable_flags`); checklist chưa đạt → chặn, PM có thể **vượt kèm lý do (ghi log `override`)**; phụ thuộc cờ cha không vượt được; tắt mọi staff được, tắt kéo theo cờ phụ thuộc; lý do bắt buộc ≥ 5 ký tự; lịch sử đổi cờ. Đường bật cờ duy nhất vẫn là `core/flags` (CLAUDE.md quy tắc 7). Nhãn cờ trên giao diện không chứa tên cờ/mã giai đoạn (khóa cờ chỉ hiện từ code ở trang nội bộ).
- Checklist `p0_reports` (L3 18.3) trong `core/reporting/flag-checks.ts`: mọi tài khoản QC đã xác nhận gán; đối chiếu 7 ngày gần nhất không lệch; không có sự cố P1 mở.
- `core/ops/admin.ts`: truy vấn ma trận (xuyên workspace có chú thích lý do, chỉ route `staff`).
- API (staff): `GET /api/v1/admin/workspaces`, `GET /api/v1/admin/workspaces/{id}/flags/{key}/checklist`, `POST /api/v1/admin/workspaces/{id}/flags/{key}`, `GET /api/v1/admin/workspaces/{id}/flag-history`.

**Sửa lỗi hạ tầng phát hiện khi chạy E2E đầy đủ**
- Storage bucket local chưa được tạo (logo, PDF lỗi "Bucket not found"): `pnpm dev` và CI chạy `supabase seed buckets` sau khi bật Supabase.
- Next.js dev nạp lại module theo route → mỗi lần tạo pool Postgres mới → cạn 100 kết nối ("remaining connection slots are reserved"). `getDb` giữ pool trên `globalThis`.
- Playwright: nạp `.env.local` trong config; reporter `github` trên CI (lỗi E2E hiện thành annotation); ESLint/Prettier bỏ qua `playwright-report/`, `test-results/`.
- Truy vấn con trong ma trận admin tham chiếu cột ngoài phải ghi đủ tên bảng (drizzle render cột không kèm bảng → đếm sai) — đã sửa và có test.

**Test tự động**
- `flag-checks.test.ts` (4): checklist đạt/chưa đạt từng mục, phụ thuộc cờ cha, ma trận admin.
- `admin.test.ts` (3): không phải staff → 404; staff thường không bật được; PM bật bị chặn khi checklist chưa đạt, vượt được và ghi log `override`; tắt kéo theo; lịch sử; khóa cờ sai 404, lý do ngắn 422.
- **E2E mới `reports-share.spec.ts`**: đồng bộ tài khoản khớp số liệu → cờ tắt không có mục Báo cáo → PM bật `p0_reports` qua AD01/AD02 (checklist 3/3 đạt) → tạo báo cáo → worker dựng (có nguồn "Khớp Meta tính đến") → tạo link → khách (trình duyệt khác, không đăng nhập) mở trang công khai có "Powered by" → **xuất PDF thật bằng Chromium trong worker** → thu hồi → khách thấy "đã hết hạn hoặc bị thu hồi".
- Bộ cách ly: 4 route admin miễn (có lý do; kiểm chặn người không phải staff ở `admin.test.ts`).

**Vùng bảo vệ:** `packages/db/**` (`getDb` giữ pool trên `globalThis` — không đổi schema/RLS), `infra/**` (không đổi; CI chạy thêm `supabase seed buckets`). Không chạm `packages/core/flags/**` (chỉ gọi API có sẵn).

**PM kiểm tra:** `pnpm seed:staff -- --email <email> --password "..." --can-enable-flags` → đăng nhập → `/admin/flags` → bật "Báo cáo" cho workspace (xem checklist, thử vượt có lý do).

## [022] PDF báo cáo A4 qua worker (Playwright) — 2026-10-23

**Thay đổi**
- `packages/core/reporting/pdf.ts` (L3 9, R07): phiên bản PDF = thời điểm dựng báo cáo (dựng lại → PDF cũ hết hiệu lực); `requestPdf` (kiểm toàn vẹn như chia sẻ — ADR-0007 — rồi enqueue `pdf:render`, đã có thì trả sẵn sàng), `pdfStatus`, `renderReportPdf` (kiểm lại toàn vẹn + phiên bản trong job, render, lưu bucket `reports/{workspace}/{report}/{phiên bản}.pdf`).
- Worker: `pdf:render` (kiểm cờ `p0_reports` ở đầu job) mở trang in nội bộ bằng URL ký 10 phút, Playwright Chromium `page.pdf` A4 + print CSS (trình duyệt dùng lại, mỗi job một context), upload Supabase Storage bằng service role.
- Trang in nội bộ `/print/report/{id}?key=` (chỉ mở bằng khóa ký đúng báo cáo + workspace, noindex), cùng mẫu báo cáo, khổ A4, nhãn Powered by theo workspace.
- `signPayload`/`verifyPayload` chuyển vào `packages/core/shared/signing.ts` (dùng chung web và worker).
- API: `POST /api/v1/reports/{id}/pdf` (202 khi đưa vào hàng đợi, 200 + URL ký 1 giờ khi đã có, 422 khi bị khóa), `GET /api/v1/reports/{id}/pdf`.
- R04: thẻ "PDF (A4)" — Xuất PDF, chờ worker xong, Tải PDF.
- `docs/onboarding.md`: cài Chromium cho worker.

**Test tự động**
- `pdf.test.ts` (2): yêu cầu → enqueue đúng phiên bản; render ghi đường dẫn; lần sau sẵn sàng không enqueue lại; dựng lại → phiên bản cũ bỏ qua; chưa toàn vẹn → 422 và job không render.
- `signing.test.ts` (1): ký/kiểm, sai secret, sửa nội dung, hết hạn.
- Worker: `pdf:render` cờ tắt → không render.
- Kiểm thủ công: render thật bằng Chromium ra tệp `%PDF` (31 KB). E2E xuất PDF qua giao diện thêm ở 042.
- Bộ cách ly: probe 2 route + job `pdf:render` dùng báo cáo B.

**Vùng bảo vệ:** không.

**PM kiểm tra:** R04 → "Xuất PDF" → "Tải PDF" mở PDF A4 cùng nội dung trang công khai.

## [021] Chia sẻ link công khai, trang báo cáo công khai mobile-first — 2026-10-23

**Thay đổi**
- DB: `app.share_links` (token 32 byte base64url, mật khẩu scrypt có muối, nhãn Powered by theo workspace lúc tạo, hạn, thu hồi, lượt xem). RLS.
- **Trigger DB `app.guard_share_link`** (lớp chặn thứ hai, ADR-0007): không tạo được link khi báo cáo chưa sẵn sàng, Client có tài khoản chưa xác nhận gán, có ngày lệch > 1% trong kỳ, hoặc kết nối Meta đã ngắt.
- `packages/core/reporting/share.ts`: tạo link (kiểm lại toàn vẹn tại thời điểm chia sẻ → 422 `REPORT_BLOCKED` kèm lý do), danh sách, thu hồi, trạng thái công khai (thu hồi / hết hạn / **tạm khóa** khi sau đó số liệu lệch hoặc kết nối bị ngắt — P0-22, P0-23 / cần mật khẩu / xem được), ghi lượt xem. `core/ops/public-share.ts`: tra token (xuyên workspace có chú thích lý do — người xem công khai không có workspace).
- API: `GET|POST /api/v1/reports/{id}/share-links` (201, url công khai theo `PUBLIC_REPORT_URL`), `DELETE /api/v1/share-links/{id}`, `POST /api/v1/public/share/{token}/unlock` (đúng mật khẩu → cookie ký 12 giờ, chỉ cho link đó).
- R04 `/reports/{id}/share` (dạng trang theo PM): tạo link (hạn 7/30/90 ngày hoặc không, mật khẩu tùy chọn, tự sao chép), danh sách (lượt xem, trạng thái, sao chép, thu hồi), trạng thái bị chặn BR01 kèm lý do và lối xử lý. Nút "Chia sẻ" ở R03.
- R06 `/r/{token}`: trang công khai mobile-first dùng chung mẫu báo cáo; trạng thái hết hạn/thu hồi, tạm khóa, mật khẩu; `noindex`.

**Test tự động**
- `packages/core/src/reporting/share.test.ts` (7): token + hạn + mật khẩu băm/kiểm; chưa xác nhận gán → 422 **và trigger DB chặn ghi thẳng**; ngày lệch → chặn API + trigger; trạng thái công khai ok/mật khẩu/hết hạn/thu hồi + đếm lượt xem; link đã tạo bị khóa khi sau đó lệch hoặc ngắt kết nối, mở lại khi hết lệch; gỡ nhãn; muối ngẫu nhiên.
- API `share.test.ts` (3): tạo/danh sách (không lộ hash)/thu hồi, 422 khi chưa xác nhận, mở khóa đúng/sai mật khẩu.
- Bộ cách ly: dữ liệu B có link chia sẻ; probe 3 route (+ báo cáo/link B), unlock miễn (có lý do).

**Vùng bảo vệ:** `packages/db/**` (1 bảng, RLS, **trigger chặn chia sẻ**, migration 0023–0024). Rủi ro: trigger chặn mọi insert share link khi dữ liệu chưa toàn vẹn — đúng ý đồ; lỗi trả `REPORT_BLOCKED`.

**PM kiểm tra:** (cờ `p0_reports` bật) R03 → "Chia sẻ" → tạo link (thử có mật khẩu) → mở link ở cửa sổ ẩn danh/điện thoại; thu hồi → link báo "đã hết hạn hoặc bị thu hồi".

## [020] Tóm tắt LLM có kiểm tra số; tóm tắt mẫu khi không có API key — 2026-10-23

**Thay đổi**
- `packages/core/reporting/summary.ts` (PRD P0-16, CLAUDE.md quy tắc 5):
  - Tập số được phép (`summaryFacts`): KPI, % thay đổi so kỳ trước, CTR, health, số tài khoản, số vấn đề (và mức cao), tác động ước tính — viết theo locale báo cáo.
  - Prompt chỉ chứa tập số + mã quy tắc; **không** đưa tên tài khoản/chiến dịch (dữ liệu người dùng, quy tắc 10). Yêu cầu không bịa/không làm tròn khác/không nhắc ngày.
  - Kiểm tra số: trích mọi số theo định dạng locale (vi "1.234,5", en "1,234.5"), bỏ ngày; mỗi số phải khớp một giá trị cho phép (±0,5% tương đối hoặc ±0,05). Không qua → sinh lại (tối đa 2 lần) → tóm tắt mẫu không LLM. LLM lỗi → tóm tắt mẫu, không chặn báo cáo.
  - Client Anthropic Messages API bằng `fetch` (không thêm SDK), model `ANTHROPIC_MODEL` (mặc định claude-sonnet-5-5), max_tokens 600, nhiệt độ 0,2. Không có `ANTHROPIC_API_KEY` → tóm tắt mẫu.
- `report:build` sinh tóm tắt khi dựng; cột `reports.summary_source` (`llm` | `template`). R03 ghi rõ nguồn tóm tắt.

**Test tự động**
- `packages/core/src/reporting/summary.test.ts` (12): trích số vi/en + bỏ ngày, số bịa bị bắt, giảm viết không dấu vẫn khớp, tập số đủ loại, prompt không chứa tên tài khoản (thử chèn lệnh), mẫu vi/en và số trong mẫu tự qua kiểm tra, LLM đúng → dùng, bịa 3 lần → mẫu (đếm lần gọi), lần 2 đúng → dùng, lỗi mạng → mẫu, client Anthropic gọi đúng định dạng / lỗi HTTP.
- `report.test.ts`: báo cáo dựng có tóm tắt mẫu.

**Vùng bảo vệ:** `packages/db/**` (1 cột, migration 0022).

**PM kiểm tra:** không có key → R03 ghi "Tóm tắt tự động từ số liệu (không dùng AI)". Có key ở staging → "Tóm tắt do AI viết… đã được kiểm tra".

## [019] Dựng báo cáo: nội dung có cấu trúc, mẫu vi/en, thương hiệu (sau cờ `p0_reports`) — 2026-10-23

**Thay đổi**
- ADR-0007 (PM chọn): cho tạo báo cáo nháp; chặn chia sẻ/gửi khi có tài khoản chưa xác nhận gán hoặc ngày lệch > 1% trong kỳ (kiểm lại tại thời điểm chia sẻ/gửi). L3 10.2 sửa cho khớp.
- DB: `app.reports` (Client, loại, kỳ, ngôn ngữ, trạng thái building/ready/failed, `content` JSON, `edits` của agency, `integrity` + `reconciliation_status` lúc dựng, phiên bản mẫu, tóm tắt cho 020, PDF cho 022). RLS.
- `packages/core/reporting/report.ts`: tạo (bất đồng bộ, enqueue `report:build`), dựng `ReportContent` (theo từng tài khoản: KPI kỳ này + kỳ trước cùng độ dài, chi tiêu/kết quả theo ngày, 5 chiến dịch chi tiêu cao nhất, health, đối chiếu; 10 phát hiện đang mở xếp theo mức độ và tác động; thương hiệu workspace ← ghi đè Client; nguồn số liệu P0-13: khớp Meta lúc nào, attribution, tiền tệ, múi giờ), toàn vẹn, chỉnh phần agency viết (tiêu đề, việc đã làm, kế hoạch, ẩn mục), dựng lại, xóa, danh sách (buyer chỉ thấy Client được gán). Loại "pitch" chưa mở (PRD P0-18 chỉ làm nếu E5 đạt).
- `SYSTEM_ACTOR` cho job worker chỉ đọc. Worker `report:build` kiểm cờ `p0_reports` ở đầu job.
- API (đều kiểm cờ phía server): `GET|POST /api/v1/reports`, `GET|PATCH|DELETE /api/v1/reports/{id}`, `POST /api/v1/reports/{id}/rebuild`.
- Mẫu báo cáo `apps/web/src/report/report-view.tsx`: một mẫu cho xem trước, trang công khai (021) và PDF (022); nhãn theo ngôn ngữ báo cáo (không theo người xem); biểu đồ SVG render server; dòng nguồn số liệu; "Powered by AdxLens" (tùy gói, 026). Đặt trong `apps/web` (không phải `packages/ui/report` như L3 9) để dùng chung bộ dịch i18n của web.
- Giao diện: sidebar "Báo cáo" sau cờ; R01 danh sách (trống, trạng thái, "Chưa chia sẻ được"); R02 tạo (Client, loại, kỳ 7/30 ngày/tháng trước/tùy chọn, ngôn ngữ); R03 xem trước (đang dựng tự cập nhật, lỗi, banner khóa chia sẻ kèm lý do và lối xử lý, chỉnh nội dung, dựng lại, xóa); C02 tab Báo cáo.
- Vitest dùng JSX runtime tự động (test render component).

**Test tự động**
- `packages/core/src/reporting/report.test.ts` (4): tạo + dựng đủ nội dung (KPI, kỳ so sánh, phát hiện mức cao trước, nguồn P0-13); toàn vẹn chưa xác nhận / lệch trong kỳ → khóa, kỳ không chứa ngày lệch → không khóa; chỉnh + dựng lại + khoảng ngày sai; quyền buyer, workspace khác.
- `apps/web/src/report/report-view.test.tsx` (4): nhãn theo ngôn ngữ báo cáo, số định dạng vi/en, delta, ẩn mục, nhãn Powered by, chưa đối chiếu.
- API `reports.test.ts` (2): **cờ tắt → 404, không tạo, không enqueue**; cờ bật tạo/xem/sửa, buyer 403. Worker: `report:build` cờ tắt → không dựng.
- Bộ cách ly: cờ bật cho A qua `core/flags`; dữ liệu B có báo cáo; probe 6 route + job `report:build` (+ báo cáo B).
- **Test đổi:** `apps/web/src/lib/nav.test.ts` — mục "Báo cáo" nay sau cờ `p0_reports` (roadmap B3), nên khi mọi cờ tắt sidebar không còn "Báo cáo"; thêm khẳng định bật cờ thì hiện.
- E2E báo cáo thêm ở 042 (khi có màn bật cờ của PM để bật trong test).

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0020–0021).

**PM kiểm tra:** bật cờ `p0_reports` cho workspace (tạm qua Supabase Studio bảng `app.feature_flags` hoặc chờ màn AD01 ở 042) → sidebar "Báo cáo" → "+ Tạo báo cáo" → R03.

## [018b] O01 Tổng quan agency, cột số liệu C01, bảng chiến dịch C02 — 2026-10-23

**Thay đổi**
- `packages/core/reporting/overview.ts` (PRD P0-11): theo Client và tài khoản — chi tiêu 7 ngày (so 7 ngày trước) và 30 ngày, ngày theo múi giờ từng tài khoản tới hôm qua, cộng theo tiền tệ (không quy đổi); health của Client = tài khoản thấp nhất; số vấn đề mức cao đang mở; đối chiếu. Tài khoản chưa gán tách riêng; kết nối đã ngắt bị loại. Không thống kê theo media buyer.
- O01 `/overview` thay trang giữ chỗ: KPI (chi tiêu 7/30 ngày — "Nhiều tiền tệ" khi không cộng được, vấn đề cao, tài khoản lệch), banner tài khoản chưa gán, bảng Client | Tài khoản QC | Chi tiêu 7 ngày + delta | 30 ngày | Health | Vấn đề cao | Đối chiếu; trạng thái trống (CTA kết nối) và đang tải (skeleton).
- C01: cột Chi tiêu 30 ngày, Health, Vấn đề cao có số liệu thật (cột Báo cáo cuối ở 019+).
- C02 tab Chiến dịch / Nhóm QC / Quảng cáo: bảng trạng thái, chi tiêu, hiển thị, click, CTR, kết quả, CPA, ROAS theo kỳ đang chọn; dòng nguồn.

**Test tự động**
- `metrics.test.ts` (+1): tổng quan theo Client (chi tiêu theo tiền tệ, 30 ngày/7 ngày trước, health, vấn đề cao, tài khoản chưa gán).
- E2E: O01 có Client vừa gán; C02 có bảng chiến dịch (cột Chiến dịch, ROAS).

**Vùng bảo vệ:** không.

**PM kiểm tra:** Tổng quan sau khi đồng bộ; Clients thấy chi tiêu 30 ngày/health; Client → tab Chiến dịch/Nhóm QC/Quảng cáo.

## [018a] Giao diện phát hiện: D01 tổng quan tài khoản, D02 danh sách, D03 chi tiết — 2026-10-23

**Thay đổi**
- `packages/core/reporting/metrics.ts`: KPI theo tài khoản (chi tiêu, kết quả, hiển thị, click, doanh thu; CTR; CPA/ROAS/CPM chia thập phân không float), chuỗi theo ngày đủ ngày (ngày thiếu = 0), bảng theo cấp campaign/ad set/ad. Áp quyền buyer theo Client. `divDecimal` trong `shared/decimal`.
- D01 `/accounts/{id}`: hàng KPI so với kỳ trước (màu theo tốt/xấu, CPA tăng = đỏ), biểu đồ xu hướng (Recharts: chi tiêu cột, kết quả đường), health score + thành phần theo nhóm, 5 phát hiện nổi bật, badge đối chiếu, dòng nguồn số liệu. Kỳ theo bộ chọn trên thanh trên, ngày theo múi giờ tài khoản.
- D02 `/accounts/{id}/findings`: lọc mức độ / trạng thái / nhóm (chip), bảng mức độ, phát hiện + đối tượng + lý do, nhóm, tác động ước tính, cập nhật, trạng thái; trống.
- D03 drawer (`?finding=`): vì sao, nên làm gì, tác động + cách tính, bằng chứng (chỉ số tuần trước → tuần này), mở trong Ads Manager, dòng "không do mô hình ngôn ngữ tạo", Đã xem / Đã làm / Bỏ qua (cần lý do) / Báo sai.
- C02 tab Cài đặt: tên tài khoản QC mở D01. Thư viện `recharts` (L3 mục 2).
- `docs/tech-debt.md`: so bố cục với Penpot khi plugin hoạt động (lần dựng này plugin bị trình duyệt tạm ngưng).

**Test tự động**
- `packages/core/src/reporting/metrics.test.ts` (5): KPI khớp tổng insight, CPA/ROAS, chuỗi ngày đủ, tổng campaign = tổng tài khoản, quyền buyer/workspace khác, không dữ liệu.
- `apps/web/src/lib/kpi.test.ts` (2): delta tốt/xấu theo chỉ số. `decimal.test.ts` (+1).
- E2E: C02 → D01 (health score) → D02 → D03 (nếu có phát hiện: mở, "Đã làm").

**Vùng bảo vệ:** không.

**PM kiểm tra:** Clients → Client → tab Cài đặt → bấm tài khoản → D01; "Xem tất cả phát hiện" → D02 → bấm một dòng → D03.

## [017] Quy tắc audit (phần 2): learning limited, chi tiêu không chuyển đổi, vệ sinh tài khoản, theo dõi chuyển đổi — 2026-10-23

**Thay đổi**
- 4 quy tắc (ngưỡng trong `docs/rules/README.md`, chờ PM duyệt):
  - `learning_limited` (ad set): trạng thái `LEARNING_LIMITED` từ API, hoặc suy từ < 50 kết quả/7 ngày khi API không trả trạng thái; mức theo tỷ trọng chi tiêu.
  - `spend_no_conversion` (ad set tối ưu chuyển đổi): chi tiêu 7 ngày vượt ngưỡng theo tiền tệ mà 0 kết quả, chỉ khi tài khoản vẫn có kết quả cùng mục tiêu ở nơi khác (tránh nhầm với lỗi theo dõi); tác động = toàn bộ chi tiêu.
  - `account_hygiene`: tên mặc định/bản sao ở đối tượng đang chạy; campaign/ad set đang bật mà 7 ngày không chi tiêu.
  - `conversion_tracking` (tài khoản): kết quả 3 ngày gần nhất giảm ≥ 70% so với 14 ngày trước trong khi chi tiêu và click không giảm tương ứng.
- Bộ v1 đủ 8 quy tắc trong `RULES`; văn bản vi/en.

**Test tự động**
- `rules-2.test.ts` (12): fixture phát hiện đúng, **không đủ dữ liệu → không phát hiện**, biên, mục tiêu click không áp dụng, cả tài khoản không có kết quả thì không báo lãng phí, chi tiêu cũng giảm thì không báo lỗi theo dõi, nhận diện tên mặc định.
- `insight.test.ts`: chạy đủ 8 quy tắc trên mock bắt thêm "chi tiêu không chuyển đổi" (ad set Sở thích) và "học hạn chế" (ad set traffic).

**Vùng bảo vệ:** không.

## [016] Quy tắc audit (phần 1): creative fatigue, phân bổ ngân sách, ad thắng bị bỏ đói, phân mảnh — 2026-10-23

**Thay đổi**
- 4 quy tắc trong `packages/core/src/insight/rules/` (ngưỡng trong `docs/rules/README.md`, chờ PM duyệt sau E4; đổi qua `app.rule_configs`):
  - `creative_fatigue` (ad): tần suất ≥ 2,5 tăng ≥ 20% và CTR giảm ≥ 25%; tác động = chi tiêu 7 ngày × mức giảm CTR.
  - `budget_misallocation` (ad set): CPA ≥ 1,5× trung vị các ad set cùng mục tiêu tối ưu, chiếm ≥ 15% chi tiêu; tác động = chi tiêu × (1 − CPA trung vị / CPA).
  - `starved_winner` (ad): CPA ≤ 0,7× ad set nhưng chi tiêu ≤ 15%; không ước tính tiền.
  - `fragmentation` (campaign): ≥ 4 và ≥ 50% ad set ngân sách nhỏ (theo tiền tệ) hoặc học hạn chế.
- Trùng lặp đối tượng **không triển khai**: API không có dữ liệu (PRD 9.4 "chỉ khi API có dữ liệu"); ghi trong `docs/rules/README.md`.
- `mulRatio` (tiền × tỷ lệ trên BigInt) cho tác động ước tính.
- Văn bản vi/en `rules.<id>.name/why/what/impact` + nhãn nhóm; số định dạng theo locale (ICU).

**Test tự động**
- `rules-1.test.ts` (12): mỗi quy tắc có fixture phát hiện đúng (mức độ, tác động), **không đủ dữ liệu → không phát hiện**, biên ngưỡng, khác mục tiêu không so, ngưỡng theo tiền tệ.
- `insight.test.ts` (+1): chạy bộ quy tắc thật trên dữ liệu mock → bắt đúng 3 mẫu cài sẵn (fatigue, ad thắng bị bỏ đói, phân mảnh).
- `apps/web/src/server/translate.test.ts` (2): mọi quy tắc có văn bản ở cả hai ngôn ngữ, dịch không sót placeholder. `decimal.test.ts` (+1).

**Vùng bảo vệ:** không.

**PM kiểm tra:** duyệt bảng ngưỡng ở `docs/rules/README.md`; giao diện phát hiện ở 018.

## [015] Insight engine: hợp đồng quy tắc, phát hiện, phản hồi, health score — 2026-10-23

**Thay đổi**
- ADR-0006: vòng đời phát hiện — một dòng mỗi (tài khoản, quy tắc, đối tượng); tự `resolved` khi hết; `done`/`resolved` mở lại khi quay lại; `dismissed` giữ nguyên; giải thích lưu khóa i18n + tham số.
- DB: `app.findings`, `app.finding_feedback`, `app.rule_configs` (mặc định toàn hệ thống / ghi đè theo workspace, `NULLS NOT DISTINCT`). RLS.
- `packages/core/insight`:
  - Hợp đồng `Rule` (L2 5.1): `defaults`, `minData`, `detect(snapshot, config)`.
  - Ảnh chụp bằng truy vấn tổng hợp SQL: 7 ngày gần vs 7 ngày trước theo múi giờ tài khoản, cấp ad / ad set / campaign (chi tiêu, hiển thị, reach, click, kết quả, doanh thu, tần suất có trọng số, số ngày hoạt động), cấu trúc + ngân sách + learning stage, chuỗi 28 ngày cấp tài khoản.
  - Engine `runAudit`: cấu hình hiệu lực (code ← toàn hệ thống ← workspace), upsert theo ADR-0006, quy tắc lỗi không chặn quy tắc khác và không xóa phát hiện cũ của nó.
  - Health score: high −15, medium −7, low −3, trần nhóm −30, sàn 0, có thành phần theo nhóm (có test khóa).
  - Phản hồi seen/done/dismissed (cần lý do)/wrong; tỷ lệ "sai" theo quy tắc (L2 5.4). Buyer chỉ thấy tài khoản của Client được gán.
  - Deep link Ads Manager theo cấp đối tượng.
- Chuỗi job: đối chiếu ổn (không có ngày lệch trong 14 ngày gần nhất) → `audit:run` (L3 7.3). Worker handler `audit:run`.
- API: `GET /api/v1/ad-accounts/{id}/findings` (lọc mức độ/nhóm/trạng thái, phân trang), `GET /api/v1/findings/{id}`, `POST /api/v1/findings/{id}/feedback`. Giải thích dịch theo locale phía server.
- `docs/rules/README.md`: hợp đồng và quy trình duyệt ngưỡng. Bộ quy tắc thật ở 016–017.

**Test tự động**
- `packages/core/src/insight/insight.test.ts` (10): ảnh chụp đúng cửa sổ + tổng khớp giữa các cấp, không dữ liệu → no_data, vòng đời ADR-0006, cấu hình tắt/ghi đè ngưỡng, quy tắc lỗi được cô lập, phản hồi + tỷ lệ sai, quyền buyer/workspace khác, health score khóa + chỉ tính đang mở, deep link.
- API `findings.test.ts` (2). Bộ cách ly: dữ liệu B có phát hiện; probe 3 route + job `audit:run` (+ tài khoản B).

**Vùng bảo vệ:** `packages/db/**` (3 bảng + RLS, migration 0018–0019).

**PM kiểm tra:** chưa có giao diện (D01–D03 ở 018); quy tắc thật ở 016–017.

## [014] Ngắt kết nối và xóa dữ liệu (S07), data deletion callback — 2026-10-23

**Thay đổi**
- DB: `app.deletion_requests` (mã xác nhận `XD-XXXXXXXX`, nguồn user/meta_callback, trạng thái pending/in_progress/done/cancelled, hạn xóa). RLS.
- `packages/core/connections/deletion.ts` (P0-22, L3 5.5, ADR-0001 A8):
  - Ngắt kết nối: xóa token ngay (ghi đè rỗng), trạng thái `revoked`, tạo yêu cầu xóa, hẹn job `maintenance:purge_connection_data` sau 7 ngày, email xác nhận kèm mã. Gọi lại khi đang chờ → cùng mã.
  - Purge: xóa kết nối và mọi dữ liệu quảng cáo (tài khoản QC, insight, cấu trúc, lần đồng bộ, đối chiếu — cascade), email "đã xóa". Kết nối lại trước hạn → hủy yêu cầu (hoàn tác nhầm lẫn). Chạy trước hạn → không xóa.
  - Không gọi API ghi của Meta để thu hồi quyền (quy tắc 3); hộp thoại hướng dẫn gỡ ứng dụng trong cài đặt Facebook.
  - `parseSignedRequest` (HMAC-SHA256, so sánh hằng thời gian).
- `packages/core/ops/data-deletion.ts`: callback Meta thu hồi mọi kết nối của `meta_user_id` ở mọi workspace (chung một mã); tra trạng thái công khai theo mã. Truy vấn xuyên workspace có chú thích lý do.
- API: `POST /api/v1/connections/{id}/disconnect`; `POST /api/v1/webhooks/meta` (form `signed_request`, trả `{ url, confirmation_code }` theo yêu cầu của Meta).
- Giao diện: S02 thêm thẻ "Kết nối Meta" (tài khoản Meta, số tài khoản QC, trạng thái, "Ngắt kết nối và xóa dữ liệu"); S07 hộp thoại (giải thích xóa token ngay, xóa dữ liệu sau 7 ngày trong cam kết 30 ngày, khóa link báo cáo, phải tick "Tôi hiểu"); banner "Đang chờ xóa dữ liệu (mã …)" / "Đã xóa dữ liệu …". Trang M05 tra cứu mã hoạt động thật (thêm trạng thái "đã hủy").
- `docs/tech-debt.md`: bỏ mục deletion-status (đã xong).

**Test tự động**
- `packages/core/src/connections/deletion.test.ts` (6): token xóa ngay + hẹn purge + email; purge trước hạn không xóa; purge đúng hạn xóa sạch 6 bảng; kết nối lại → hủy; gọi lại cùng mã; buyer/workspace khác bị chặn; callback Meta thu hồi đúng người dùng ở nhiều workspace, không chạm người khác; chữ ký sai/payload hỏng bị từ chối; mã không tồn tại.
- `apps/web/src/app/api/v1/connections/disconnect.test.ts` (2): API ngắt kết nối (buyer 403, không lộ token), webhook chữ ký đúng/sai/thiếu.
- Bộ cách ly: probe route disconnect (+ kết nối B), webhook miễn (có lý do); probe job purge (+ kết nối B).
- E2E: ngắt kết nối từ S02 → banner có mã → trang M05 hiển thị "Đã nhận yêu cầu".

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0016–0017), `packages/core/connections/**` (xóa token khi ngắt kết nối). Rủi ro: purge xóa cascade toàn bộ dữ liệu của kết nối — chỉ chạy khi đã quá hạn 7 ngày và kết nối chưa được kết nối lại (có test).

**PM cần làm khi cấu hình Meta App:** Data Deletion Callback URL và Deauthorize Callback URL = `https://<APP_URL>/api/v1/webhooks/meta`; trang hướng dẫn xóa dữ liệu = `https://<APP_URL>/data-deletion`.

**PM kiểm tra:** Kết nối → thẻ "Kết nối Meta" → "Ngắt kết nối và xóa dữ liệu" → tick → banner mã XD-…; Mailpit có email xác nhận; mở `/data-deletion?code=<mã>`.

## [013b] Playbook meta_rate_limited, token_expiring; báo cáo E4 — 2026-10-23

**Thay đổi**
- `packages/core/ops/playbooks.ts` (L2 11.2):
  - `meta_rate_limited`: health check `meta_rate_limit` (job_audit 15 phút gần nhất: ≥ 20 lời gọi và > 20% bị rate limit → lỗi, sự cố P2); playbook hoãn queue `sync` 15 phút (BullMQ `rateLimit`), tối đa 3 lần/giờ rồi leo thang. Chạy ngay sau `ops:health_check`.
  - `token_expiring`: job `maintenance:daily_tick` (lên lịch 09:00 giờ Việt Nam) quét kết nối sắp hết hạn trong 7 ngày → email người kết nối (1 lần/ngày/kết nối). Token dài hạn của Meta không làm mới được phía server nên hành động là nhắc kết nối lại. Đã quá hạn → kết nối "hết hạn", sự cố P3, email báo đã hết hạn. Truy vấn xuyên workspace có chú thích lý do (module ops).
- Email `connectionExpiringEmail` (vi/en), link tới trang Kết nối.
- Worker: dịch vụ `appUrl`, `throttleQueue`.
- Báo cáo E4: `dataCoverageReport` (theo workspace: ngày có dữ liệu, ngày đối chiếu, ngày lệch, lệch chi tiêu lớn nhất, tỷ lệ phủ tần suất/doanh thu/kết quả, loại kết quả, số campaign/ad set/ad/creative, creative có thumbnail, video, learning stage, ngân sách) + `pnpm e4:report -- --workspace <uuid> [--days 30]` in Markdown (chặn chạy ở production).
- `docs/onboarding.md` mục 5: đồng bộ, đối chiếu, lịch định kỳ, E4.

**Test tự động**
- `packages/core/src/ops/playbooks.test.ts` (5): email nhắc + giới hạn 1 lần/ngày, bỏ qua kết nối còn xa/không hạn, quá hạn → hết hạn + sự cố + email không chứa token, ngưỡng rate limit (dưới 20 lời gọi, đúng 20%), hoãn queue 3 lần rồi leo thang, kiểm tra ổn thì không chạy.
- `apps/worker/src/dispatch.test.ts` (+1): `maintenance:daily_tick`.
- `reconciliation.test.ts` (+1): báo cáo E4 đúng số và chỉ trong workspace, Markdown.

**Vùng bảo vệ:** không.

**PM kiểm tra:** `pnpm e4:report -- --workspace <id workspace đã đồng bộ> --days 14` in bảng; với tài khoản thật của design partner (staging) đây là báo cáo E4.

## [013a] Đối chiếu số liệu với Meta (ngưỡng 1%), D04 — 2026-10-23

**Thay đổi**
- DB: `app.reconciliation_results` theo (tài khoản, ngày): chi tiêu, kết quả, hiển thị, click liên kết, doanh thu chuyển đổi — AdxLens và Meta; `results_by_type` (từng action_type), độ lệch % numeric(10,6), `ok`/`warning`. RLS.
- `packages/core/shared/decimal.ts`: số thập phân cố định trên BigInt (cộng tiền, độ lệch %, so sánh) — không float.
- `packages/core/reconciliation`:
  - `RECONCILIATION_THRESHOLD_PCT = 1` (có test khóa). Ngày `ok` khi chi tiêu **và** kết quả lệch ≤ 1% (L3 6.4).
  - Kết quả so theo từng loại action (mua hàng, lead, click…) trên mọi ad với insight cấp tài khoản của Meta, lấy loại lệch nhiều nhất (không để loại này bù loại kia). Ngày Meta có số mà AdxLens thiếu dữ liệu → lệch.
  - Lệch → sự cố P2 `reconciliation_warning` + playbook `reconcile_retry`: đồng bộ lại các ngày lệch sau 24 giờ (1 lần/ngày/tài khoản, vượt thì leo thang). Hết lệch → đóng sự cố. Token thu hồi → kết nối hết hạn.
  - Badge 7 ngày tới hôm qua theo múi giờ tài khoản; chi tiết D04 (tổng từng chỉ số, ROAS tính trên số nguyên).
- Ingestion: lần chạy đồng bộ xong tự enqueue `reconcile:account` cho khoảng ngày của nó; `startManualSync` (đồng bộ lại khoảng ≤ 90 ngày, có thể hoãn); jobId backfill gắn với lần chạy (để đồng bộ lại không bị trùng job cũ). Trạng thái đồng bộ không bị lần đồng bộ lại đã lên lịch (chưa chạy) che mất.
- Worker: handler `reconcile:account`.
- API: `GET /api/v1/ad-accounts/{id}/reconciliation?from&to` (D04), `POST /api/v1/ad-accounts/{id}/resync`, `sync-status` có `reconciliation` (trước đây `null`).
- Giao diện: D04 Đối chiếu số liệu (Penpot: chọn tài khoản, 7/14/30 ngày, "Chạy lại đồng bộ", banner ngày lệch, bảng Chỉ số | AdxLens | Ads Manager | Chênh lệch | % | Trạng thái, nguyên nhân có thể, dòng nguồn); badge "Khớp x% / Lệch x%" ở S06, cột Đối chiếu C01, tiêu đề C02 (bấm mở D04).

**Test tự động**
- `packages/core/src/shared/decimal.test.ts` (3); `packages/core/src/reconciliation/reconciliation.test.ts` (9): ngưỡng khóa 1%, biên ≤ 1%, ROAS, tài khoản khớp mọi ngày, mock lệch 1,4% đúng một ngày → warning + sự cố + playbook hoãn 24 giờ + lần 2 leo thang, hết lệch đóng sự cố, thiếu dữ liệu nội bộ → lệch, pending, không đối chiếu tài khoản workspace khác.
- `ingestion.test.ts` (+1): lần đồng bộ lại đã lên lịch không che backfill đã xong.
- Worker: chạy hết hàng đợi → backfill xong tự đối chiếu 90 ngày.
- API `ad-accounts/reconciliation.test.ts` (5); `lib/recon.test.ts` (3).
- Bộ cách ly: dữ liệu B có kết quả đối chiếu; probe job `reconcile:account` (+ biến thể tài khoản B), 2 route mới.
- E2E: S06 hiện badge đối chiếu cho 2 tài khoản; C02 → D04.
- **Test đổi:** `connections.test.ts` trước khẳng định `reconciliation: null` (giữ chỗ của 012); nay là `{ status: 'pending' }` vì 013 điền đối chiếu thật.

**Vùng bảo vệ:** `packages/db/**` (1 bảng + RLS, migration 0014–0015).

**PM kiểm tra:** sau S06, mở Clients → cột Đối chiếu; Client có tài khoản "Thời trang Linh" (mock lệch 1,4% ngày 3 hôm trước) → "Lệch 1,4%" → D04 thấy banner ngày lệch, bảng chỉ số, "Chạy lại đồng bộ".

## [012] Đồng bộ số liệu: backfill 90 ngày, daily sync, S06 — 2026-10-23

**Thay đổi**
- ADR-0005 (PM chọn): backfill bắt đầu ngay khi nhập tài khoản ở S04; xác nhận gán chỉ chặn chia sẻ/gửi. L2, L3 7.3 sửa cho khớp.
- DB: `analytics.entities` (campaign/ad set/ad/creative; ngân sách numeric; `attrs` có optimization_goal, thumbnail…), `analytics.insights_daily` (cấp ad, `date` theo múi giờ ad account, tiền numeric(18,4), `results` + `result_type` theo mục tiêu tối ưu, `conversion_value`, cửa sổ attribution 7d_click_1d_view), `app.sync_runs` (backfill/daily, lô, số ngày, số dòng, mã lỗi). RLS cho cả ba.
- `packages/core/ingestion`: chia lô 7 ngày (mới nhất trước), `startBackfill` (idempotent; lần trước lỗi thì tạo lần mới), `syncRange` (lô đầu đồng bộ cấu trúc, upsert insight theo khóa (tài khoản, loại, id, ngày), cộng tiến độ nguyên tử vì các lô chạy song song; xong thì tài khoản `ok`, `last_synced_at`, `active_30d` theo chi tiêu 30 ngày), `runDailySync` (3 ngày tới hôm qua; cùng ngày chạy rồi thì bỏ qua), `syncStatuses`. Lỗi token (190) → kết nối hết hạn, lỗi quyền → `no_access`, cả hai không retry; lỗi tạm thời ném để BullMQ retry, lần cuối ghi `META_RATE_LIMITED`/`META_ERROR`. Số tiền Meta đi thẳng chuỗi → numeric, không qua float.
- Kết quả theo `optimization_goal` (mua hàng, lead, click, landing page view, tin nhắn…) và `custom_event_type` của ad set.
- Worker: handler `sync:backfill_account`, `sync:daily_account`; scheduler mỗi giờ `maintenance:daily_sync_tick` tìm tài khoản đang 03:00 giờ địa phương (`core/ops/daily-sync.ts`, truy vấn xuyên workspace có chú thích lý do) và enqueue daily sync. `dispatch` truyền `finalAttempt`.
- API: `POST /ad-accounts/import` bắt đầu backfill; `GET /api/v1/ad-accounts/{id}/sync-status` (L3 10.2; đối chiếu = null tới 013); `POST /api/v1/ad-accounts/{id}/sync` (thử lại).
- Giao diện S06 Tiến độ đồng bộ (Penpot): thanh tiến độ, "N% · x / y tài khoản", bảng Tài khoản | Tiến độ (Xong / Đang chạy N% / Lỗi) | Đối chiếu (— tới 013), tự làm mới khi đang chạy, banner lỗi theo nguyên nhân + "Thử lại đồng bộ" hoặc "Kết nối lại với Meta", "Tiếp tục" khi xong. S05 "Xong, bắt đầu đồng bộ" → S06. Không hiển thị "còn khoảng N phút" và "sẽ email khi xong" (chưa có ước lượng tin cậy và email — 023).
- E2E: Playwright khởi động worker riêng (`webServer` thứ hai, chờ log khởi động).

**Test tự động**
- `packages/core/src/ingestion/ingestion.test.ts` (11): chia lô, kết quả theo goal, chuỗi tiền không qua float, backfill trọn 90 ngày **tổng chi tiêu từng ngày khớp insight cấp tài khoản của Meta mock**, tiến độ giữa chừng, idempotent (không lần mới, không nhân đôi dòng), ngày theo múi giờ tài khoản, token thu hồi, rate limit retry + lần cuối, mất quyền, không đồng bộ tài khoản workspace khác, daily sync 3 ngày + bỏ qua chạy lại.
- `apps/worker/src/handlers/sync.test.ts` (4): mọi lô qua dispatch, `finalAttempt`, scheduler đúng tài khoản 03:00 + ngày theo múi giờ, bỏ qua kết nối hết hạn.
- `apps/web/src/lib/sync-progress.test.ts` (3); API import → 13 job backfill, sync-status, thử lại khi đang chạy không tạo lần mới.
- Bộ cách ly: dữ liệu B có sync run + entity + insight; probe job `sync:backfill_account`, `sync:daily_account` (+ biến thể dùng tài khoản B); probe 2 route mới.
- E2E `clients-assign.spec.ts`: thêm S06 chờ worker đồng bộ xong 2 tài khoản → Tiếp tục → C01.

**Vùng bảo vệ:** `packages/db/**` (3 bảng + RLS, migration 0012–0013). Không chạm token (dùng `withConnectionToken` có sẵn).

**PM kiểm tra:** `pnpm dev` → kết nối Meta (mock) → S04 chọn → S05 → "Xong, bắt đầu đồng bộ" → S06 chạy tới 100% trong vài giây. Supabase Studio: `analytics.insights_daily` có dữ liệu 90 ngày, cột tiền kiểu numeric.

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
