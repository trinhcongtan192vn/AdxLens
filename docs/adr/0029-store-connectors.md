# ADR-0029: Kết nối cửa hàng / analytics — Shopify (OAuth Partner) và GA4 (Google OAuth)

- Trạng thái: **Chấp nhận** (PM 25/10/2026):
  - Shopify: app OAuth qua Partner;
  - GA4: Google OAuth;
  - mỗi shop / property gắn **một Client**; hiển thị ở Business Dashboard (nội bộ + link công khai).
- Liên quan: ADR-0016 (tài sản Meta), ADR-0028 (link Business công khai)
- Vùng bảo vệ:
  - `packages/db` (bảng mới);
  - token mã hóa dùng `core/connections/secrets`.
- Thực hiện:
  - CHANGELOG 130: Shopify;
  - CHANGELOG 131: GA4.

## Quyết định

**1. Package mới `packages/store-client`** — lớp duy nhất gọi API Shopify / Google Analytics, giống `meta-client` với
Meta:
- HTTP client, phân trang, kiểm phản hồi bằng zod;
- có bản mock (`STORE_MOCK=1`, dùng cho local / test).
- Không ghi gì lên cửa hàng / property: chỉ đọc.

**2. Module core mới `stores`** — bảng:
- `app.store_connections` (theo workspace):
  - provider `shopify` | `ga4`; mã ngoài (tên miền shop / property id); tên, tiền tệ, múi giờ;
  - Client được gắn;
  - token **mã hóa** (cùng khóa `TOKEN_ENC_KEY_*` như token Meta; web chỉ mã hóa, worker giải mã);
  - trạng thái, lần đồng bộ / lỗi gần nhất.
- `analytics.store_daily`: theo ngày của shop / property.
  - Shopify: số đơn, doanh thu.
  - GA4: phiên, chuyển đổi, doanh thu.
  - Tiền là `numeric` (quy tắc 4).

**3. Shopify:**
- **OAuth:** quyền `read_orders`. Kiểm `hmac` (SHA-256 với client secret) + `state` (cookie ký, cùng workspace / user);
  tên miền shop đúng dạng `*.myshopify.com`.
- **Token:** offline, không hết hạn; thu hồi khi gỡ app hoặc ngắt kết nối.
- **Số liệu:** đơn theo ngày (múi giờ shop), loại đơn hủy và đơn test; doanh thu = `current_total_price`.

**4. GA4:**
- **OAuth:** quyền `analytics.readonly`, `access_type=offline` (refresh token mã hóa).
- **Property:** người dùng chọn property; ngày theo múi giờ property.
- **Số liệu:** Data API `runReport` theo ngày — sessions, conversions (key events), purchaseRevenue.
- Google verification cho scope nhạy cảm do PM làm khi ra production; local / staging dùng test users.

**5. Đồng bộ:**
- Job `sync:store_daily`: kiểm kết nối còn hoạt động; ghi đè (upsert) các ngày trong khoảng.
- Vừa kết nối → lấy 30 ngày. Hằng ngày → lấy 3 ngày gần nhất (như Meta).

**6. Hiển thị** — Business Dashboard (phạm vi Client / tài khoản của Client):
- doanh thu cửa hàng, số đơn, AOV cửa hàng;
- **MER** = doanh thu cửa hàng / chi tiêu quảng cáo cùng kỳ (chỉ khi cùng tiền tệ);
- phiên và chuyển đổi GA4.
- Số do code tính; LLM không tạo số.
- Link Business công khai hiện thêm các ô này khi Client đã kết nối.

**7. Ngắt kết nối:** xóa token ngay; xóa số liệu ngày của kết nối (như dữ liệu Meta khi ngắt).

## Rủi ro
- **Token cửa hàng:** mã hóa, không log, không trả qua API; chỉ worker giải mã.
- **Số liệu cửa hàng lệch với báo cáo của shop** (múi giờ, đơn hoàn): ghi rõ định nghĩa ở trang; không dùng cho đối chiếu
  Meta 1%.

## Phụ lục — Shopee (PM 25/10/2026: "tích hợp luôn shopee"; TikTok Ads chưa cần)

- **Provider `shopee`** (Shopee Open Platform v2):
  - ký HMAC-SHA256 bằng partner key;
  - Shopee không trả lại `state`, nên `state` gắn trong chính redirect URL và đối chiếu với cookie ký.
- **Token:**
  - lưu refresh token (mã hóa);
  - access token 4 giờ;
  - refresh token **xoay vòng**: mỗi lần làm mới, worker mã hóa lại token mới và lưu ngay.
- **Đơn:**
  - `get_order_list` theo cửa sổ ≤ 15 ngày + `get_order_detail` theo lô 50;
  - bỏ đơn hủy; doanh thu `total_amount`;
  - ngày theo múi giờ vùng của shop.
- Doanh thu / đơn Shopee cộng chung với Shopify của cùng Client (cùng tiền tệ); không đổi schema (`provider` là text).

## Phụ lục — TikTok Shop (PM 25/10/2026: "lấy số khách bán trên tiktok"; khác TikTok Ads, vẫn chưa làm)

- **Provider `tiktok_shop`** (TikTok Shop Open API 202309):
  - ký HMAC-SHA256 bằng app secret (secret + path + tham số đã sắp + body + secret);
  - token đi kèm header `x-tts-access-token`.
- **Một lần ủy quyền có thể gồm nhiều shop:** mỗi shop là một kết nối.
  - Token lưu (mã hóa) = JSON gồm refresh token + `shop_cipher`.
  - Refresh token dùng chung giữa các shop của cùng lần ủy quyền: khi TikTok trả token mới, worker cập nhật mọi kết nối
    đang giữ token cũ.
- **Đơn:** `orders/search` theo `create_time` và phân trang `page_token`; bỏ đơn hủy; doanh thu `payment.total_amount`.
- Không đổi schema.

