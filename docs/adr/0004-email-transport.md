# ADR-0004: Gửi email qua SMTP (nodemailer)

- Trạng thái: Đã chấp nhận (Claude Code theo ủy quyền ADR-0001; PM review cuối)
- Ngày: 23/10/2026

## Bối cảnh
L3 mục 2 chọn Resend làm nhà cung cấp email. Ở local, Supabase CLI chạy Mailpit (SMTP cổng 54325, giao diện http://127.0.0.1:54324). Cần gửi email từ cả web (lời mời) và worker (digest, lịch báo cáo, cảnh báo — B4).

## Quyết định
- Thư viện `nodemailer`, một đường gửi SMTP duy nhất cho mọi môi trường:
  - local: Mailpit (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325`, không xác thực);
  - staging/production: SMTP relay của Resend (`smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<API key>`), PM cấu hình secrets.
- Interface `EmailSender` ở `packages/core/notification`; nội dung email dựng trong core (song ngữ vi/en), không dựng trong route.
- Test dùng `memoryEmailSender` ghi lại email, không gửi thật.

## Hệ quả
- Không cần SDK Resend; đổi nhà cung cấp chỉ cần đổi biến SMTP.
- Domain gửi (ST01 "Email gửi báo cáo") phải xác minh SPF/DKIM ở Resend; trạng thái xác minh đọc qua API Resend ở feature 023.
