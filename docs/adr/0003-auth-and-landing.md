
# ADR-0003: Xác thực, landing và workspace trong apps/web (mốc L)

- Trạng thái: Đã chấp nhận (Claude Code theo ủy quyền ADR-0001; PM review cuối)
- Ngày: 22/10/2026
- Liên quan: L3 mục 2 (Supabase Auth), mục 3 (cấu trúc), mục 11 (bảo mật); PRD P0-01; ux-requirements 6.1, 6.7

## Bối cảnh
Mốc L (landing, đăng ký, đăng nhập, workspace) không có trong L3. L3 mục 2 đã chọn Supabase Auth (email/password, magic link, JWT). Cần quyết định cách tích hợp vào Next.js, cách tạo workspace, lời mời, vai trò staff.

## Quyết định
1. **Nhà cung cấp:** Supabase Auth, chỉ email + mật khẩu ở bản đầu (magic link để sau). Bắt buộc xác minh email trước khi vào app (`enable_confirmations = true`), mật khẩu ≥ 8 ký tự.
2. **Phiên:** cookie do `@supabase/ssr` quản lý; middleware làm mới phiên mỗi request; API chấp nhận thêm `Authorization: Bearer <jwt>` (L3 10.1).
3. **Luồng (route group `(auth)` trong apps/web):**
   - `/signup` (A01) → Supabase `signUp` với `emailRedirectTo=/auth/callback`; **không tiết lộ email đã tồn tại**: luôn chuyển tới A02 "kiểm tra email" với cùng thông điệp.
   - `/verify-email` (A02): gửi lại email xác minh.
   - `/auth/callback`: đổi mã (PKCE) lấy phiên, đồng bộ `app.users`, chuyển tới `next` (chỉ đường dẫn nội bộ) hoặc `/onboarding/workspace` nếu chưa có workspace.
   - `/login` (A03): lỗi sai thông tin chung chung, không nói email có tồn tại không.
   - `/forgot-password` (A04): luôn báo "đã gửi nếu email tồn tại".
   - `/reset-password` (A05): đặt mật khẩu mới với phiên từ link; link hết hạn → trạng thái X.
   - `/invite/[token]` (A06) và `/onboarding/workspace` (A07) ở feature 008.
4. **Mọi thao tác auth chạy phía server** (Server Action gọi Supabase), không gọi Supabase Auth trực tiếp từ client, để chính sách không tiết lộ email và rate limit được kiểm soát một chỗ.
5. **Chuyển hướng an toàn:** tham số `next` chỉ nhận đường dẫn bắt đầu bằng `/` và không bắt đầu bằng `//`.
6. **Hồ sơ:** `app.users` là bản sao (id, email, tên, locale) để join trong truy vấn nghiệp vụ; nguồn sự thật về xác thực là Supabase.
7. **Staff:** vai trò đội AdxLens nằm ở `app.staff`, tách khỏi vai trò agency; `/admin` chỉ staff (feature 042). Script seed tạo staff ở local.

## Hệ quả
- Email xác minh/đặt lại mật khẩu ở local đi qua Mailpit (http://127.0.0.1:54324).
- Staging/production cấu hình SMTP (Resend) trong Supabase project; Claude Code không cấu hình production.
- L3 mục 3 bổ sung route group `(marketing)`, `(auth)`, `(app)` trong `apps/web`.
