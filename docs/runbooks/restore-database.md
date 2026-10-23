# Runbook: khôi phục cơ sở dữ liệu

**Khi nào:** mất / hỏng dữ liệu do lỗi migration, xóa nhầm, sự cố hạ tầng (L3 11).

## 1. Dừng ghi
- Bật kill switch toàn cục (`/admin/kill-switch` hoặc `pnpm killswitch -- on --reason "khôi phục DB"`) để không có hành động ghi lên Meta trong lúc khôi phục.
- Tạm dừng worker (ngừng đồng bộ / báo cáo theo lịch) — PM thao tác trên nền tảng.

## 2. Khôi phục
- Supabase PITR 7 ngày: Dashboard → Database → Backups → Point in time → chọn thời điểm ngay trước sự cố. Có bản dump hằng tuần (bucket riêng, mã hóa) khi cần xa hơn.
- Redis chỉ là hàng đợi: mất thì không sao — chạy lại theo `sync_runs` (daily sync tự bù 3 ngày gần nhất; backfill dở → "Đồng bộ lại").
- Sau khôi phục: `pnpm db:check` trên nhánh tương ứng; kiểm tra migration đã áp đúng phiên bản.

## 3. Sau khôi phục
- Chạy đối chiếu lại các ngày bị ảnh hưởng (D04 "Đồng bộ lại"); báo cáo bị khóa chia sẻ cho tới khi khớp.
- Hành động ghi nằm giữa thời điểm khôi phục và sự cố: đối chiếu nhật ký hành động với Ads Manager trước khi tắt kill switch.
- Chỉ PM có quyền production (CLAUDE.md quy tắc 9).
