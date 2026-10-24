# ADR-0016: Xin quyền Meta rộng ngay lần kết nối đầu

- Trạng thái: **Chấp nhận** (PM chọn trong MCQ 24/10/2026, "Xin rộng như Madgicx"). Thay đổi PRD P0-03.
- Ngày: 24/10/2026
- Liên quan: ADR-0008 (Execution Gateway), P201 (luồng nâng quyền ghi), `docs/research/madgicx-2026-10.md` mục 5.1
- Vùng bảo vệ: `packages/core/connections`, `packages/meta-client` (OAuth)

## Bối cảnh

AdxLens hiện chỉ xin `ads_read` và `business_management`. Quyền `ads_management` chỉ xin riêng khi Owner nâng quyền
ghi (P201). Madgicx thì xin một lần, gộp tất cả: ghi quảng cáo, Page, lead, Instagram, catalog.

PM muốn làm giống Madgicx. Có hai lý do:
1. Có dữ liệu nền cho onboarding theo Client (Page / Instagram / Pixel mặc định, ADR-0017).
2. Có dữ liệu nền cho các tính năng sau (agent, lead, creative).

## Quyết định

**Bộ quyền khi kết nối** (`CONNECT_SCOPES`, một lần):

| Nhóm | Quyền |
|---|---|
| Quảng cáo | `ads_read`, `ads_management` |
| Doanh nghiệp | `business_management`, `catalog_management` |
| Page | `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_ads`, `pages_manage_posts`, `pages_manage_engagement`, `leads_retrieval` |
| Instagram | `instagram_basic` |

**Bắt buộc và tùy chọn:**
- Chỉ `ads_read` là bắt buộc. Thiếu `ads_read` thì vẫn báo `missing_scope` như hiện nay.
- Các quyền còn lại người dùng có thể bỏ chọn trong hộp thoại của Meta. AdxLens lưu đúng danh sách Meta thực sự cấp
  (`meta_connections.scopes`) và hiện danh sách đó trên trang Kết nối.

**Quyền ghi vẫn hai lớp, không đổi ADR-0008.** Có `ads_management` trong scope **chưa** cho phép ghi. Muốn ghi phải đủ
cả ba điều kiện:
1. Owner bật `write_enabled`, ở trang Quyền ghi;
2. cờ `p2a_approve` / `p2b_auto` đang bật;
3. đi qua Execution Gateway (guardrails, kill switch).

Nếu kết nối đã có `ads_management`, trang Quyền ghi chỉ còn công tắc bật / tắt, không cần OAuth lại. Kết nối cũ chưa có
quyền này vẫn dùng luồng P201 như cũ.

**Dữ liệu tài sản** (`meta_assets`, mới). Worker dùng token đã giải mã để đọc **danh sách**:
- Page: `id`, `name`, `category`, `picture`;
- Instagram business account gắn với Page: `id`, `username`;
- Pixel / dataset của ad account: `id`, `name`, `last_fired_time`;
- Catalog của Business: `id`, `name`.

Giới hạn khi đọc tài sản:
- **Không lưu page access token.** Meta trả `access_token` trong `/me/accounts`; ta không xin trường đó, và nếu Meta
  vẫn trả thì bỏ ở lớp zod.
- **Chưa đọc** nội dung Page, bình luận hay lead. Chỉ làm khi có tính năng dùng đến, và tính năng đó cần ADR riêng
  (tối thiểu hóa dữ liệu).

**Màn xin quyền** đổi câu "chỉ đọc" thành:
- danh sách nhóm quyền và **AdxLens dùng quyền đó để làm gì**;
- câu cam kết: "AdxLens **không tự thay đổi quảng cáo**. Mọi thay đổi cần bạn bật quyền ghi và duyệt từng lần."

## Hệ quả và rủi ro

- **App Review của Meta.** App ở chế độ Development thì chỉ người có vai trò trong app (tester) mới cấp được các quyền
  này, đủ cho bản team. Đưa lên production phải qua App Review cho **từng** quyền và có video quay màn hình. Quyền nào
  chưa được duyệt, Meta sẽ không hiện trong hộp thoại; AdxLens vẫn chạy vì chỉ bắt buộc `ads_read`.
- **Khách agency lo ngại** vì app xin quyền ghi ngay từ đầu.
  - Giảm thiểu: màn giải thích; ghi vẫn tắt mặc định; Owner thu hồi được.
- **Token có quyền ghi bị lộ thì thiệt hại lớn hơn.**
  - Giảm thiểu: giữ nguyên mã hóa token, chỉ giải mã trong worker, không log (quy tắc 2).
  - Không thêm đường ghi nào ngoài `packages/core/execution` (quy tắc 3).
- Test cũ khóa `READ_SCOPES = ['ads_read','business_management']` đổi thành khóa `CONNECT_SCOPES`.
  - Lý do: chính quyết định này. Ghi lại trong CHANGELOG 075.
