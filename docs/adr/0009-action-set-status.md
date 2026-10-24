# ADR-0009: Hành động ghi — tạm dừng / bật lại ad hoặc ad set

- Trạng thái: Đề xuất (PM duyệt bắt buộc)
- Ngày: 23/10/2026
- Liên quan: ADR-0008, PRD P2-02, PRD 11.2 mục 6

## Quyết định
- `action_type`: `pause_ad`, `resume_ad`, `pause_adset`, `resume_adset`.
- Gọi Meta: `POST /{id}` với `status=PAUSED` hoặc `status=ACTIVE`.
- `before_state` = `{ status, effective_status }` đọc ngay trước khi ghi; `after_expected` = `{ status }`.
- Verify: đọc lại `status`; khớp `after_expected` → thành công.
- Hoàn tác: được (đặt lại `status` cũ).
- **Không bao giờ tự bật lại** (resume) đối tượng mà người dùng đã tắt thủ công (PRD 11.2.6): `resume_*` chỉ có ở `tier=approve` hoặc là hoàn tác của một `pause_*` do AdxLens thực hiện. Rule tự động (P2b) không được tạo `resume_*`.
- Đối tượng đã ở trạng thái đích → không gọi Meta, ghi nhận "không cần thay đổi".

## Rủi ro
- Tạm dừng ad duy nhất của ad set làm ad set ngừng phân phối: hộp thoại duyệt hiển thị cảnh báo khi ad set chỉ còn 1 ad đang chạy.
