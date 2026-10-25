# Runbook: smoke test sau deploy thất bại

**Khi nào:** pipeline deploy dừng ở bước smoke; sự cố P1 `deploy_smoke_failed` (luôn báo PM).

## 1. Smoke kiểm gì
`pnpm smoke -- <base_url>`: `/api/health` 200, trang chủ, `/pricing` (có tên gói), `/r/demo`, `/login`. Lỗi → thoát mã 1 và ghi sự cố (khi có `DATABASE_URL`), kèm `APP_VERSION`.

## 2. Giảm thiểu
- **Rollback** về bản deploy trước trên nền tảng (Vercel: "Promote" bản trước; worker: chạy lại image trước). PM thực hiện — agent không có quyền production (CLAUDE.md quy tắc 9).
- Nếu bản lỗi chạm `execution`: bật kill switch toàn cục trước khi rollback (`/admin/kill-switch` hoặc `pnpm killswitch -- on --reason "deploy lỗi"`).

## 3. Sau rollback
- Chạy lại smoke trên bản đã rollback → đạt thì sự cố tự đóng.
- Mở issue `agent-diagnose` với phiên bản lỗi và trang lỗi; sửa bằng PR có test.
