# Runbook: kết nối cửa hàng / analytics (Shopify, GA4)

ADR-0029. Dùng khi cài AdxLens ở môi trường mới (local / staging) hoặc khi PM tạo app thật.

## 1. Chạy thử không cần app (local)

Trong `.env.local`, đặt `STORE_MOCK=1`, rồi khởi động lại app và worker.
- Ở **Kết nối → Cửa hàng & Analytics**, nhập tên shop bất kỳ → **Kết nối Shopify**.
- App bỏ qua Shopify thật, tạo kết nối giả và đồng bộ 30 ngày số liệu giả.
- Không dùng `STORE_MOCK=1` ở staging / production: app báo lỗi khi khởi động.

## 2. Shopify (app OAuth qua Shopify Partners)

### 2.1 Tạo app
1. Vào <https://partners.shopify.com> → **Apps** → **Create app** → **Create app manually**.
2. Đặt tên (vd. `AdxLens`).
3. **App URL:** `https://<tên miền app>/connections`, ví dụ `https://adxlens-dev.sctech.io.vn/connections`.
4. **Allowed redirection URL(s):** `https://<tên miền app>/api/v1/stores/shopify/callback`.
   - Phải trùng từng ký tự với địa chỉ app công khai.
5. **API access:** chỉ cần quyền **read_orders**; AdxLens không ghi gì lên shop.
6. **Distribution:**
   - Thử nghiệm: dùng **Custom distribution** cho từng shop của khách, hoặc **development store**.
   - Phát hành cho nhiều agency: **Public distribution**, qua review của Shopify.

### 2.2 Điền vào `.env.local`
```
SHOPIFY_CLIENT_ID=<Client ID của app>
SHOPIFY_CLIENT_SECRET=<Client secret của app>
SHOPIFY_API_VERSION=2025-07
STORE_MOCK=0
```
Khởi động lại app và worker. Với bản team, chạy lại `node scripts/team.mjs`, script tự copy `.env.local` lần đầu.

Nếu bản team đã có `.env.local` riêng, sửa thêm ở
`E:\VideCode\AdxLens-team\.env.local`.

### 2.3 Kết nối một shop
1. Owner / Manager vào **Kết nối → Cửa hàng & Analytics**.
2. Nhập `ten-shop` hoặc `ten-shop.myshopify.com`, chọn Client → **Kết nối Shopify**.
3. Chủ shop đăng nhập Shopify và **Install** app.
4. AdxLens quay về trang Kết nối và đồng bộ 30 ngày đơn hàng.
   - Hằng ngày lúc 03:00 giờ shop, lấy lại 3 ngày gần nhất.
5. Số liệu hiện ở **Business Dashboard**: doanh thu cửa hàng, số đơn, AOV, MER. Link Business công khai của Client cũng
   hiện các ô này.

### 2.4 Sự cố
| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Quay về trang Kết nối với `?store=invalid` | Phiên quá 10 phút, hoặc redirect URL / client secret không khớp app. Kiểm mục 2.1 bước 4 và `SHOPIFY_CLIENT_SECRET`. |
| `?store=failed` | Đổi code lấy token lỗi: sai client id / secret, hoặc shop chưa cài app. |
| Kết nối hiện "Cần kết nối lại" | Token bị thu hồi (gỡ app khỏi shop). Kết nối lại. |
| Doanh thu khác báo cáo Shopify | AdxLens tính theo ngày tạo đơn (múi giờ shop), bỏ đơn hủy và đơn test, dùng `current_total_price` (sau hoàn / sửa đơn). |

## 3. GA4 (Google OAuth)

### 3.1 Tạo OAuth client trên Google Cloud
1. Vào <https://console.cloud.google.com> → tạo / chọn project (vd. `adxlens`).
2. **APIs & Services → Library** → bật **Google Analytics Data API** và **Google Analytics Admin API**.
3. **OAuth consent screen:**
   - User type **External**; điền tên app, email hỗ trợ.
   - **Scopes:** thêm `https://www.googleapis.com/auth/analytics.readonly`.
   - **Test users:** thêm email Google của người sẽ kết nối khi thử nghiệm. Khi app còn ở chế độ *Testing*, chỉ test
     users đăng nhập được, và refresh token hết hạn sau 7 ngày.
4. **Credentials → Create credentials → OAuth client ID** → loại **Web application**:
   - **Authorized redirect URIs:** `https://<tên miền app>/api/v1/stores/ga4/callback`
     (vd. `https://adxlens-dev.sctech.io.vn/api/v1/stores/ga4/callback`).
5. Ra production: gửi **Verification** cho scope `analytics.readonly` (Google duyệt vài ngày đến vài tuần). Trước khi
   duyệt xong, app chỉ dùng được với test users.

### 3.2 Điền vào `.env.local`
```
GOOGLE_CLIENT_ID=<Client ID>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<Client secret>
STORE_MOCK=0
```
Khởi động lại app và worker (bản team: chạy `node scripts/team.mjs`).

### 3.3 Kết nối một property
1. Lấy **Property ID** (dãy số) ở GA4 → **Quản trị → Cài đặt property**.
2. Ở **Kết nối → Cửa hàng & Analytics**, nhập Property ID, chọn Client → **Kết nối Google Analytics**.
3. Đăng nhập Google bằng tài khoản có quyền **Viewer** trở lên trên property đó → **Cho phép**.
4. AdxLens kiểm quyền đọc property:
   - không có quyền → quay về `?store=noaccess`;
   - có quyền → lưu refresh token (mã hóa) và đồng bộ 30 ngày phiên / chuyển đổi.
5. Business Dashboard hiện **Phiên (GA4)** và **Chuyển đổi (GA4)**. Doanh thu GA4 không cộng vào doanh thu cửa hàng,
   để tránh tính trùng với Shopify.

### 3.4 Sự cố
| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Google báo `redirect_uri_mismatch` | URI ở mục 3.1 bước 4 phải trùng từng ký tự với địa chỉ app công khai. |
| `?store=noaccess` | Tài khoản Google đăng nhập không có quyền trên property, hoặc nhập sai Property ID. |
| Kết nối hiện "Cần kết nối lại" sau ~7 ngày | App OAuth đang ở chế độ *Testing*: refresh token hết hạn sau 7 ngày. Kết nối lại, hoặc chuyển app sang *In production*. |
