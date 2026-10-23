# Runbook: xoay khóa mã hóa token Meta

**Khi nào:** định kỳ, hoặc nghi lộ `TOKEN_ENC_KEY_V1` (L3 5.4).

## Các bước
1. Sinh khóa mới 32 byte (base64): `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Đặt `TOKEN_ENC_KEY_V2=<khóa mới>` cho **worker** và route OAuth callback (web), giữ nguyên `TOKEN_ENC_KEY_V1`. Deploy. Từ lúc này token mới được mã hóa bằng V2; token cũ vẫn đọc được bằng V1.
3. Chạy `pnpm tokens:rotate` trong môi trường của worker: mã hóa lại mọi kết nối bằng V2 (theo từng workspace; chỉ in số lượng, không in token). Chạy lại an toàn (bỏ qua kết nối đã ở V2).
4. Kiểm tra: `select token_key_version, count(*) from app.meta_connections where status <> 'revoked' group by 1` → chỉ còn 2.
5. Gỡ khóa cũ: đổi V2 thành khóa chính theo quy ước triển khai (một deploy nữa) và hủy khóa cũ trong kho bí mật.

## Không làm
- Không log / in token; không chạy rotate trên máy dev với dữ liệu production (CLAUDE.md quy tắc 2, 9).
