# Runbook

Mỗi runbook: **khi nào dùng → dừng / giảm thiểu → xác định phạm vi → khôi phục → không làm**. Sự cố hiện ở `/admin/incidents` (AD03); kênh báo đội gửi P1/P2 qua email `OPS_ALERT_EMAILS` / Slack `OPS_SLACK_WEBHOOK_URL`.

| Runbook | Khi nào | Playbook tự động |
|---|---|---|
| [execution-incident.md](execution-incident.md) | Hành động ghi trên Meta thất bại / sai; breaker mở | `execution_failed` (P1, không giới hạn) |
| [reconciliation-mismatch.md](reconciliation-mismatch.md) | Số liệu lệch > 1% so với Ads Manager | `reconcile_retry` (1 lần/ngày/tài khoản) |
| [meta-rate-limit.md](meta-rate-limit.md) | Meta chặn vì rate limit | `meta_rate_limited` (3 lần/giờ) |
| [token-expired.md](token-expired.md) | Token Meta sắp / đã hết hạn | `token_expiring` (1 lần/ngày) |
| [backfill-failed.md](backfill-failed.md) | Đồng bộ 90 ngày lỗi / kẹt | `worker_stuck` (3 lần/giờ) |
| [deploy-smoke-failed.md](deploy-smoke-failed.md) | Smoke test sau deploy lỗi | `deploy_smoke_failed` (luôn báo PM) |
| [payment-failed.md](payment-failed.md) | Thanh toán thất bại, quá hạn, webhook không tới | — |
| [data-deletion.md](data-deletion.md) | Yêu cầu xóa dữ liệu (Meta callback, S07) | job purge sau 7 ngày |
| [restore-database.md](restore-database.md) | Mất / hỏng dữ liệu, cần khôi phục DB | — |
| [rotate-token-key.md](rotate-token-key.md) | Xoay khóa mã hóa token Meta | — |
| [flags-release.md](flags-release.md) | PM bật / tắt cờ cho workspace | — |
| [agent-diagnose.md](agent-diagnose.md) | Lỗi code mới cần agent phân tích | — |
| [dev-public.md](dev-public.md) | Mở bản dev trên máy local cho team test qua domain (Cloudflare Tunnel, Meta tester, Resend) | — |

**Không bao giờ tự động (L2 11.3):** sửa Execution Gateway / guardrails / RLS / migration; nới ngưỡng đối chiếu; tắt cảnh báo; xóa dữ liệu ngoài quy trình; bật cờ; thực thi lại hành động ghi thất bại.

**Diễn tập:** `pnpm drill` giả lập 3 sự cố (rate limit, đối chiếu lệch, thực thi lỗi) trên local và kiểm từng playbook (xem `docs/onboarding.md`).
