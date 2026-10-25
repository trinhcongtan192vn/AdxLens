# ADR-0010: Hành động ghi — điều chỉnh ngân sách ngày của ad set

- Trạng thái: Đề xuất (PM duyệt bắt buộc)
- Ngày: 23/10/2026
- Liên quan: ADR-0008, ADR-0001 A7, PRD P2-02, PRD 11.2 mục 6

## Quyết định
- `action_type`: `set_adset_budget` (chỉ ngân sách **ngày** của ad set; ad set dùng ngân sách trọn đời hoặc ngân sách ở cấp campaign (CBO) bị từ chối với lý do rõ ràng).
- Gọi Meta: `POST /{adset_id}` với `daily_budget=<số nguyên đơn vị nhỏ nhất của tiền tệ>`. Tiền tính bằng thập phân (`numeric`), không float; làm tròn xuống tới đơn vị nhỏ nhất.
- Guardrail khóa bằng test: |thay đổi| ≤ 15% so với ngân sách hiện tại trên Meta **tại thời điểm thực thi** (không phải lúc tạo gợi ý); workspace chỉ được đặt mức nhỏ hơn. Không bao giờ vượt trần ngân sách người dùng đặt (`max_daily_budget` trong guardrails workspace, nếu có).
- `before_state` = `{ daily_budget }`; `after_expected` = `{ daily_budget }`; verify đọc lại và so bằng nhau tuyệt đối.
- Hoàn tác: được (đặt lại ngân sách cũ — cũng phải qua guardrail ±15%; nếu vượt, hoàn tác chia nhiều bước không tự động mà báo người dùng).

## Rủi ro
- Thay đổi ngân sách có thể đưa ad set về giai đoạn học: hộp thoại duyệt ghi cảnh báo này.
