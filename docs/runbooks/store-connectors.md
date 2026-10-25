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
Làm ở bước 131 — mục này sẽ được bổ sung.
