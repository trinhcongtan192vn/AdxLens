# Runbook: đồng bộ 90 ngày (backfill) lỗi hoặc kẹt

**Khi nào:** S06 dừng ở một % lâu, trạng thái "Lỗi", sự cố `worker_stuck` hoặc `health:stuck_work`, `health:queue_backlog_sync`.

## 1. Hệ thống đã làm gì
- Mỗi lô 7 ngày là một job, BullMQ retry lỗi tạm thời (backoff). Lần thử cuối ghi lỗi bền vững (`sync_runs.error`, mã ngắn, không có thông điệp thô của Meta).
- Playbook `worker_stuck` (mỗi 5 phút qua health check, tối đa 3 lần/giờ): lần đồng bộ "đang chạy" > 3 giờ → `failed / stalled` để chạy lại. Hành động ghi kẹt > 15 phút → `failed / stuck_check_manually` (**không chạy lại lời gọi ghi**, kiểm tra trên Ads Manager).

## 2. Xác định phạm vi
- AD03: số lần đồng bộ / hành động kẹt. S06 / D04: tài khoản nào, lô nào.
- Mã lỗi thường gặp: `no_access` (người kết nối mất quyền tài khoản), `token_expired` (xem token-expired.md), `meta_17` (rate limit — xem meta-rate-limit.md).

## 3. Khôi phục
- Người dùng bấm "Đồng bộ lại" (S06 / D04) — lô đã xong không chạy lại.
- Worker không chạy: kiểm tra tiến trình worker / Redis (`pnpm dev` local; dịch vụ worker ở staging) rồi khởi động lại; job dở được BullMQ trả về queue (stalled detection).

## 4. Không làm
- Không xóa `sync_runs` / `insights_daily` bằng tay để "làm lại từ đầu" khi chưa có task.
