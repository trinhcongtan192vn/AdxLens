# Runbook: Meta rate limit

**Khi nào:** sự cố `health:meta_rate_limit` (> 20% lời gọi Meta bị chặn trong 15 phút, tối thiểu 20 lời gọi), đồng bộ chậm.

## 1. Hệ thống đã làm gì
- Playbook `meta_rate_limited`: hoãn queue `sync` 15 phút (tối đa 3 lần/giờ). Bộ giới hạn trong `meta-client` tự giảm đồng thời 50% khi header usage của Meta ≥ 75%.
- Vượt 3 lần/giờ → leo thang (báo PM).

## 2. Xác định phạm vi
- AD03: chi tiết `{ total, limited, ratio }`.
- Bảng `app.job_audit` (staging): endpoint và tài khoản bị chặn nhiều nhất (không chứa token).

## 3. Khôi phục
- Thường tự hết sau 15–60 phút. Nếu kéo dài: giảm số workspace đồng bộ cùng lúc (giữ queue `sync` tạm dừng), kiểm tra có vòng lặp gọi Meta bất thường không (issue `agent-diagnose`).
- Không ảnh hưởng thực thi đã duyệt: hành động ghi đi queue `execute` riêng (đồng thời 1).

## 4. Không làm
- Không tăng giới hạn đồng thời để "chạy cho nhanh"; không tắt kiểm tra sức khỏe.
