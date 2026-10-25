# ADR-0018: Alert do người dùng tự đặt, gợi ý ngưỡng từ dữ liệu

- Trạng thái: **Chấp nhận** (thuộc phạm vi PM chọn 24/10/2026)
- Ngày: 24/10/2026
- Vùng bảo vệ: `packages/db` (bảng mới)

## Quyết định

**Bảng `app.custom_alerts`.** Các cột:
- `workspace_id`, `ad_account_id` (hoặc `client_id`);
- `metric`: dùng chung danh sách với ADR-0017;
- `condition`: `above` hoặc `below`;
- `threshold`: `numeric`;
- `window`: `1d` hoặc `7d`;
- `enabled`, `created_by`, `last_fired_at`.

**Đánh giá:**
- Worker đánh giá alert **sau mỗi lần đồng bộ ngày**, bằng số đã tính trong core.
- Một alert bắn tối đa một lần mỗi ngày.
- Thông báo gửi qua module `notification` sẵn có (in-app + email theo cài đặt).

**Gợi ý ngưỡng:**
- Lấy giá trị 7 ngày trượt trong 30 ngày qua, tìm min và max.
- Đề xuất "báo khi vượt" ở khoảng phân vị 90 (với chỉ số chi phí) hoặc "báo khi dưới" ở khoảng phân vị 10 (với ROAS / CTR).
- Hiện kèm khoảng min–max để người dùng hiểu ngưỡng lấy từ đâu.
- Code tính, không dùng LLM.

**Phạm vi:** alert là thông tin, **không có hành động ghi** nên không cần cờ P1 / P2. Giới hạn 50 alert / workspace.
