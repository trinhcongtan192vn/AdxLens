# ADR-0011: Hành động ghi — nhân bản ad set

- Trạng thái: Đề xuất (PM duyệt bắt buộc)
- Ngày: 23/10/2026
- Liên quan: ADR-0008, PRD P2-02 ("nếu API cho phép")

## Quyết định
- `action_type`: `duplicate_adset`. Gọi Meta: `POST /{adset_id}/copies` với `deep_copy=true`, `status_option=PAUSED` — **bản sao luôn ở trạng thái tạm dừng**; người dùng tự bật trên Ads Manager hoặc bằng một hành động `resume_adset` được duyệt riêng.
- Không tự retry: gọi lặp có thể tạo hai bản sao. Lỗi giữa chừng → verifier tìm bản sao theo `copied_adset_id` trả về hoặc theo tên có hậu tố do Meta đặt trong 10 phút gần nhất; không chắc chắn → `failed` + cảnh báo "cần kiểm tra trên Ads Manager".
- `after_expected` = `{ copy_status: PAUSED }`; verify đọc lại bản sao.
- **Không hoàn tác tự động** (xóa đối tượng là hành động phá hủy): hộp thoại duyệt cảnh báo trước "không hoàn tác được"; hoàn tác thủ công = tạm dừng/xóa bản sao trên Ads Manager.
- Chỉ ở `tier=approve` trong v1; rule tự động không dùng hành động này.
