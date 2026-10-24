# Runbook: mở bản dev trên máy local cho team test qua domain

> Mục tiêu: team test AdxLens qua `https://adxlens-dev.sctech.io.vn`. App vẫn chạy trên máy dev của PM, đưa ra ngoài qua
> Cloudflare Tunnel. Đây là môi trường **dev/staging**, không phải production. Prod sau này dùng hostname riêng
> (`adxlens.sctech.io.vn`), Meta App, Supabase và key thanh toán riêng.
>
> **Ai làm:** PM làm mục 1–4, vì các mục này cần tài khoản và secrets của PM. Không gửi token, API key hay mật khẩu cho
> Claude Code (CLAUDE.md quy tắc 9). Mục 5 chạy sau khi code chế độ "dev công khai" đã merge.

## 0. Tên miền dùng

| Hostname | Trỏ tới | Dùng cho |
|---|---|---|
| `adxlens-dev.sctech.io.vn` | `http://localhost:3000` | App (dashboard, link báo cáo `/r/...`, webhook) |
| `adxlens-dev-sb.sctech.io.vn` | `http://localhost:54321` | Supabase local: link xác minh email, logo, PDF |
| `notify.sctech.io.vn` | (chỉ DNS email) | Tên miền gửi email qua Resend |
| `adxlens.sctech.io.vn` | để dành cho prod | **Chưa tạo** |

Dùng subdomain **một cấp** (`adxlens-dev.`, không dùng `dev.adxlens.`), vì chứng chỉ SSL miễn phí của Cloudflare chỉ phủ
`*.sctech.io.vn`.

Không mở ra ngoài: Supabase Studio (`:54323`), Mailpit (`:54324`), Postgres (`:54322`), Redis (`:6379`).

---

## 1. Cloudflare: đưa domain về Cloudflare và tạo Tunnel

### 1.1 Thêm domain (một lần)
1. Đăng ký <https://dash.cloudflare.com> → **Add a domain** → `sctech.io.vn` → gói **Free**.
2. Cloudflare quét và nhập các bản ghi DNS hiện có. **Kiểm tra kỹ trước khi đổi nameserver:**
   - website công ty (A / CNAME của `@`, `www`);
   - email công ty: **MX**, TXT SPF (`v=spf1 ...`), DKIM, nếu đang dùng Google Workspace / Microsoft 365 / email hosting;
   - các subdomain khác đang dùng.

   Thiếu bản ghi nào thì thêm tay cho đủ. Bản ghi MX và TXT luôn để **DNS only** (mây xám).
3. Vào trang quản lý tên miền ở nhà đăng ký `.vn` → đổi **nameserver** sang 2 nameserver Cloudflare cung cấp. Một số
   nhà đăng ký `.vn` yêu cầu khai báo hoặc xác nhận qua email. Thời gian áp dụng: vài phút đến 24 giờ.
4. Khi Cloudflare báo **Active**: vào **SSL/TLS → Edge Certificates**, bật **Always Use HTTPS**.

### 1.2 Cài cloudflared và tạo Tunnel
1. PowerShell (**Run as Administrator**): `winget install --id Cloudflare.cloudflared`
2. Cloudflare → **Zero Trust** (lần đầu chọn gói Free, đặt tên team) → **Networks → Tunnels → Create a tunnel** →
   **Cloudflared** → tên `adxlens-dev`.
3. Chọn **Windows**, copy lệnh `cloudflared.exe service install <TOKEN>` rồi chạy trong PowerShell Administrator.
   Tunnel chạy dạng Windows service, tự bật khi khởi động máy. **TOKEN là secret: không dán vào chat hay commit.**
4. Tab **Public Hostname → Add a public hostname**:

   | Subdomain | Domain | Type | URL |
   |---|---|---|---|
   | `adxlens-dev` | `sctech.io.vn` | HTTP | `localhost:3000` |
   | `adxlens-dev-sb` | `sctech.io.vn` | HTTP | `localhost:54321` |

5. Kiểm tra: tunnel ở trạng thái **HEALTHY**.
   - Khi AdxLens đang chạy, mở `https://adxlens-dev.sctech.io.vn` phải thấy trang chủ.
   - Mở `https://adxlens-dev-sb.sctech.io.vn/auth/v1/health` phải trả JSON. Báo thiếu `apikey` cũng được, nghĩa là
     tunnel đã thông tới Supabase.

### 1.3 (Khuyến nghị) Chỉ cho team vào: Cloudflare Access
Bản dev có dữ liệu thật, nên nên chặn người lạ:
1. **Zero Trust → Access → Applications → Add → Self-hosted** → domain `adxlens-dev.sctech.io.vn`.
2. Policy **Allow** → *Emails*: danh sách email của team. Đăng nhập bằng mã OTP gửi về email.
3. Thêm một policy **Bypass** (Everyone) cho các đường dẫn mà máy chủ bên ngoài phải gọi được:
   - `adxlens-dev.sctech.io.vn/api/v1/webhooks/*` (Meta, Stripe, PayOS);
   - `adxlens-dev.sctech.io.vn/r/*`, nếu muốn gửi link báo cáo cho khách xem thử.
4. **Không** đặt Access cho `adxlens-dev-sb.sctech.io.vn`, vì link xác minh email, logo và PDF phải mở được trực tiếp.
5. Khi nộp Meta App Review sau này, cần tắt Access hoặc thêm email reviewer.

### 1.4 Máy chạy liên tục
- **Settings → System → Power**: *When plugged in, put my device to sleep* = **Never**.
- Docker Desktop: bật *Start Docker Desktop when you sign in*.
- Máy tắt, ngủ, hoặc AdxLens đang build lại (1–2 phút sau mỗi lần merge code) thì team không vào được. Nên báo team
  giờ cập nhật.

---

## 2. Meta: thêm domain dev và tester

Dùng **Meta App dev đang có** (app ở chế độ *Development*). Không dùng app này cho prod.

1. <https://developers.facebook.com/apps> → chọn app → **App settings → Basic**:
   - **App domains**: thêm `adxlens-dev.sctech.io.vn`;
   - **Privacy Policy URL**: `https://adxlens-dev.sctech.io.vn/privacy`;
   - **Terms of Service URL**: `https://adxlens-dev.sctech.io.vn/terms`;
   - **User data deletion** → *Data deletion callback URL*: `https://adxlens-dev.sctech.io.vn/api/v1/webhooks/meta`.
   - Bấm **Save changes**.
2. **Facebook Login for Business** (hoặc *Facebook Login*) → **Settings**:
   - **Valid OAuth Redirect URIs**: thêm `https://adxlens-dev.sctech.io.vn/api/v1/connections/meta/callback`, giữ dòng
     `http://localhost:3000/...` đang có;
   - **Deauthorize callback URL** (nếu có ô này): `https://adxlens-dev.sctech.io.vn/api/v1/webhooks/meta`.
3. **App roles → Roles → Add People → Testers**: nhập Facebook (tên hoặc ID) của từng người trong team.
   - Mỗi người phải có tài khoản <https://developers.facebook.com> (đăng ký miễn phí), rồi chấp nhận lời mời ở
     <https://developers.facebook.com/requests>.
   - Ở chế độ Development, **chỉ** admin / developer / tester của app đăng nhập Facebook trong AdxLens được.
4. Tester muốn kết nối tài khoản quảng cáo nào thì phải **có quyền với tài khoản đó trong Business Manager** (quyền của
   Meta, AdxLens không cấp thay được).
5. Giữ app ở **Development**. Chuyển *Live* cần App Review (`ads_read`, `business_management` Advanced Access), làm sau.

---

## 3. Resend: email thật cho team

Ở local, mọi email (xác minh tài khoản, quên mật khẩu, lời mời, báo cáo) đang rơi vào Mailpit trên máy PM. Muốn team
nhận được email thì cần SMTP thật.

1. Đăng ký <https://resend.com> (gói Free: 3.000 email/tháng, 100/ngày).
2. **Domains → Add Domain** → `notify.sctech.io.vn`, region **Tokyo (ap-northeast-1)**.

   Dùng subdomain riêng để không đụng email công ty ở `sctech.io.vn`.
3. Resend hiện các bản ghi DNS: MX + TXT (SPF) cho `send.notify...`, TXT DKIM `resend._domainkey.notify...`.
   - Thêm từng bản ghi vào **Cloudflare → DNS → Records**, Proxy status = **DNS only**.
   - Bấm **Verify** ở Resend, chờ trạng thái *Verified*.
4. Thêm DMARC (nếu `notify` chưa có): Cloudflare → DNS → TXT, name `_dmarc.notify`, content `v=DMARC1; p=none;`.
5. **API Keys → Create API Key**: tên `adxlens-dev`, quyền *Sending access*, domain `notify.sctech.io.vn`. Copy key.
   Key chỉ hiện một lần.
6. **PM tự điền** vào `.env.local` ở thư mục dự án (Claude Code không đọc file này):

   ```dotenv
   EMAIL_FROM=AdxLens <no-reply@notify.sctech.io.vn>
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASS=<API key Resend>
   ```

   Cùng cấu hình này sẽ được dùng cho cả email của app và email của Supabase Auth (xác minh, quên mật khẩu) khi bật chế
   độ dev công khai (mục 4).

---

## 4. Bật chế độ "dev công khai" trong `.env.local`

**PM tự điền**, thêm vào `.env.local`:

```dotenv
# Chế độ dev công khai: để trống 2 dòng URL = chỉ chạy localhost như cũ.
PUBLIC_DEV_APP_URL=https://adxlens-dev.sctech.io.vn
PUBLIC_DEV_SUPABASE_URL=https://adxlens-dev-sb.sctech.io.vn
# Tài khoản PM (superadmin). Bắt buộc đặt mật khẩu riêng ≥ 12 ký tự khi mở ra ngoài.
PM_EMAIL=<email của anh, vd. tan@sctech.io.vn>
PM_PASSWORD=<mật khẩu mạnh>
```

Không đổi `APP_URL` hay `SUPABASE_URL`, vì script tự xử lý (mục 5).

---

## 5. Chạy và kiểm tra

1. Đóng cửa sổ AdxLens đang chạy (nếu có) → mở lại `Mo-AdxLens.cmd`.
2. **Script làm gì khi thấy `PUBLIC_DEV_APP_URL`:**
   - từ chối chạy nếu mật khẩu PM còn mặc định / quá ngắn, hoặc SMTP vẫn trỏ về Mailpit;
   - cấu hình Supabase Auth: site URL, redirect, link trong email dùng `adxlens-dev-sb...`, gửi qua Resend. Lần đầu
     Supabase khởi động lại (khoảng 1 phút);
   - chạy web và worker với `APP_URL` = domain dev, link logo / PDF = `adxlens-dev-sb...`;
   - kiểm tra tunnel trả lời được rồi mới báo sẵn sàng.
3. **Kiểm tra theo thứ tự:**
   1. `https://adxlens-dev.sctech.io.vn/login` → đăng nhập bằng `PM_EMAIL` / `PM_PASSWORD`.
   2. Từ máy khác (điện thoại 4G): đăng ký một tài khoản mới → nhận email xác minh từ `no-reply@notify.sctech.io.vn`
      → bấm link → vào được app.
   3. **Kết nối Meta** bằng một Facebook đã là tester → về lại `adxlens-dev...` (không về localhost).
   4. Tải logo ở Cài đặt → Workspace → logo hiện được trên máy khác.
   5. Tạo báo cáo → **Tải PDF** → mở được trên máy khác.
   6. `/admin` → Hôm nay hiện bình thường.
4. **Mời team:**
   - gửi link `https://adxlens-dev.sctech.io.vn/signup`, hoặc mời vào workspace của anh ở Cài đặt → Thành viên;
   - thêm Facebook của họ làm tester (mục 2.3);
   - thêm email của họ vào Cloudflare Access (mục 1.3) nếu đã bật.

## 6. Tắt chế độ công khai
Xóa giá trị `PUBLIC_DEV_APP_URL` trong `.env.local` → mở lại `Mo-AdxLens.cmd`. Script trả Supabase Auth về localhost và
Mailpit. Muốn chặn hẳn từ ngoài: Cloudflare → Tunnels → `adxlens-dev` → xóa 2 public hostname (hoặc dừng service
`cloudflared` trong *services.msc*).

## 7. Bản team tách riêng và nút "Cập nhật bản test"

Bản team chạy ở **thư mục riêng** `E:\VideCode\AdxLens-team` (git worktree), luôn ở bản `develop` **đã push** lên GitHub.
Code đang làm dở ở `E:\VideCode\AdxLens` không ảnh hưởng team.

| | Thư mục dev `E:\VideCode\AdxLens` | Thư mục team `E:\VideCode\AdxLens-team` |
|---|---|---|
| Ai dùng | Dev / Claude Code sửa code, chạy unit test | Team test qua `adxlens-dev.sctech.io.vn` |
| Code | Nhánh đang làm | `origin/develop` (chỉ code đã merge + push) |
| Dùng chung | Supabase (DB, tài khoản), Redis, `.env.local` (bản team copy lần đầu) | ← |

**Cập nhật bản team:** double-click **`Cap-nhat-AdxLens.cmd`** (ở thư mục dev hay team đều được). Script làm theo thứ tự:
1. lấy `origin/develop` mới nhất; lần đầu tự tạo thư mục team và copy `.env.local`;
2. **build bản mới trong lúc app cũ vẫn chạy** (2–4 phút, team vẫn dùng bình thường);
3. migration DB, tài khoản PM;
4. dừng app cũ → chuyển sang bản build mới → bật app trong cửa sổ **"AdxLens (ban team)"**. Team gián đoạn **vài
   giây**; script in thời gian gián đoạn thực tế và danh sách thay đổi mới.

Đã là bản mới nhất và đang chạy thì script báo "không cần cập nhật".

**Lưu ý:**
- **Sau khi khởi động lại máy:** mở `E:\VideCode\AdxLens-team\Mo-AdxLens.cmd` (hoặc chạy lại `Cap-nhat-AdxLens.cmd`).
  Không mở `Mo-AdxLens.cmd` ở thư mục dev cho team, vì sẽ chạy code đang làm dở.
- **Đổi `.env.local`:** sửa ở **thư mục team** (`E:\VideCode\AdxLens-team\.env.local`) → đóng cửa sổ "AdxLens (ban team)"
  → mở `Mo-AdxLens.cmd` của thư mục team.
- **Không sửa file trong thư mục team.** Script từ chối cập nhật nếu thấy file bị sửa tay.
- **Khi bản team đang chạy, thư mục dev không chạy app hay E2E được** (cùng cổng 3000, cùng DB). Unit test vẫn chạy được
  vì dùng database riêng `adxlens_test`; E2E chạy trên CI. Không chạy `pnpm db:migrate` ở thư mục dev với migration chưa
  merge (DB dùng chung).

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `adxlens-dev...` báo lỗi 1033 / 502 | Tunnel chạy nhưng AdxLens chưa chạy, hoặc đang build lại | Mở `Mo-AdxLens.cmd`, chờ "AdxLens đã chạy" |
| Bấm link xác minh email ra `127.0.0.1` | Chưa bật chế độ công khai, hoặc Supabase chưa khởi động lại | Kiểm tra mục 4, mở lại `Mo-AdxLens.cmd` |
| Kết nối Meta báo "URL bị chặn" | Chưa thêm redirect URI dev ở mục 2.2 | Thêm đúng URL `/api/v1/connections/meta/callback` |
| Người trong team không đăng nhập Facebook được | Chưa là tester, hoặc chưa chấp nhận lời mời | Mục 2.3 |
| Không nhận email | Domain Resend chưa *Verified*, sai `SMTP_PASS`, hoặc hết hạn mức 100 email/ngày | Resend → Logs |
| Logo / PDF không hiện trên máy khác | Thiếu hostname `adxlens-dev-sb` trong tunnel | Mục 1.2 bước 4 |
