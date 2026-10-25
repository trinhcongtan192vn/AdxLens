# ADR-0027: Creative mới — upload ảnh và AI tạo ảnh (khóa OpenAI của workspace)

- Trạng thái: **Chấp nhận** (PM 25/10/2026: "Upload creative + AI tạo ảnh"; cách AI: khóa OpenAI tự mang của workspace,
  ADR-0022)
- Liên quan: ADR-0008 (Execution Gateway), ADR-0022 (BYO AI), ADR-0023 (Ad Launcher)
- Vùng bảo vệ:
  - `packages/db` (bảng `creative_drafts`, migration 0079–0080);
  - `packages/core/execution`;
  - `packages/meta-client/write`.
- Thực hiện:
  - CHANGELOG 127: upload + tạo creative;
  - CHANGELOG 128: AI tạo ảnh.

## Quyết định

**1. Bản nháp creative** (`app.creative_drafts`, theo workspace + tài khoản QC):
- Ảnh lưu ở bucket **private** `creatives` (PNG / JPEG / WebP, tối đa 5MB, kiểm định dạng theo nội dung file).
- Nguồn:
  - `upload`: người dùng tải lên;
  - `ai`: worker tạo, xem mục 3.
- Trạng thái: `generating` → `ready` | `failed`.

**2. `create_creative` (Execution Gateway, duyệt tay):**
- Worker tải ảnh từ bucket → `POST /act_x/adimages` (lấy `hash`) → `POST /act_x/adcreatives` với `object_story_spec`:
  - Page của workspace (tài sản đã đồng bộ, ADR-0016);
  - `link_data`: ảnh, link đích (https), nội dung chính, tiêu đề, nút CTA trong danh sách cố định.
- Xác minh: đọc lại creative.
- Creative không tự tiêu tiền.
  - Quảng cáo tạo từ creative đi qua Ad Launcher (luôn PAUSED).
  - Không hoàn tác.
- Thành công → ghi creative vào bản chụp cấu trúc, để chọn ngay ở Ad Launcher.

**3. AI tạo ảnh (bước 128):**
- **Khóa:**
  - chỉ dùng khóa OpenAI của workspace (ADR-0022), giải mã **chỉ trong worker**;
  - workspace không có khóa OpenAI → không có tính năng.
  - Không dùng khóa nền tảng.
- **Luồng:** job `creative:generate_image` gọi OpenAI Images với prompt người dùng nhập (có giới hạn độ dài) → lưu PNG
  vào bucket → bản nháp `ready`.
- **Ghi nhận:** lỗi chỉ ghi mã (không ghi khóa / nội dung trả về); chi phí tính vào tài khoản OpenAI của agency.
- **Nội dung:** ảnh AI là bản nháp; người dùng xem rồi mới tạo creative (bước 2, vẫn cần duyệt). LLM không tạo số
  liệu.

**Chung:**
- Cờ `p2a_approve`.
- Rule tự động không bao giờ tạo creative (`no_auto_create`).
- Quyền: Owner / Manager / buyer được gán Client như Launcher.

## Rủi ro
- **File độc hại:** kiểm định dạng theo byte đầu; bucket private; giới hạn 5MB.
- **Nội dung vi phạm chính sách quảng cáo Meta:** Meta duyệt khi chạy quảng cáo; creative không tự chạy.
- **Chi phí AI ngoài ý muốn:** chỉ khi người dùng bấm tạo; giới hạn số ảnh mỗi lần.
