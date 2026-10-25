# Lộ trình "Workspace" — kết nối rộng, onboarding theo Client, giao diện mới, AI agent, MCP

- Ngày: 24/10/2026. PM quyết định (MCQ 24/10):
  - xin quyền Meta rộng như Madgicx;
  - onboarding theo **Client**;
  - giao diện Workspace **song song** giao diện cũ;
  - làm toàn bộ trang Workspace, **cả AI agent và MCP**.
- Đầu vào: `docs/research/madgicx-2026-10.md` mục 2 và 5. Giao diện **lấy bố cục và luồng** của Madgicx, nhưng dùng
  thương hiệu, màu, chữ, icon của AdxLens (design system Penpot). Không sao chép logo, tên, nội dung hay hình ảnh của
  Madgicx.
- Quy tắc tuyệt đối trong CLAUDE.md vẫn giữ nguyên ở mọi đợt:
  - chỉ Execution Gateway ghi Meta;
  - LLM không tạo số;
  - cờ kiểm ở server;
  - guardrails không nới.

## Các đợt

| Đợt | CHANGELOG | Nội dung | ADR | Vùng bảo vệ |
|---|---|---|---|---|
| W0 | 074 | Lộ trình + ADR 0016–0020 | — | — |
| W1 | 075 | **Quyền rộng khi kết nối** + đọc danh sách Page / Instagram / Pixel / Catalog | 0016 | connections, meta-client |
| W2 | 076 | **Onboarding theo Client**: mục tiêu chính (kèm số thực tế hôm qua / 7 / 30 ngày), chỉ số 2–3, ngành + ngành con, Page / IG / Pixel mặc định | 0017 | db |
| W3 | 077 | **Khung giao diện Workspace** `/w/*` + nút "Đổi giao diện" | — | — |
| W4 | 078 | **Home**: điểm sức khỏe 0–100, 4 KPI tùy chỉnh có sparkline + so kỳ trước + độ phủ dữ liệu, Needs attention | — | — |
| W5 | 079 | **Alert tự đặt** + gợi ý ngưỡng từ dữ liệu 30 ngày (1 click) | 0018 | db |
| W6 | 080 | **Ads**: lưới theo từng quảng cáo (thumbnail, loại, 4 chỉ số chọn được, lọc, 7/14/30 ngày) | — | — |
| W7 | 081 | **Ads Manager**: cột chọn được, sparkline + % trong ô, dòng tổng, ẩn đối tượng không chi tiêu | — | — |
| W8 | 082 | **Funnels / Geography / Scale** (từ `insights_daily` + `insights_breakdowns` sẵn có) | — | — |
| W9 | 083 | **AI Agents** (chat): công cụ đọc trả số đã tính; hành động ghi chỉ **đề xuất** vào hàng chờ duyệt | 0019 | flags (đọc), execution (chỉ gọi interface) |
| W10 | 084 | **MCP server** cho AdxLens theo quyền workspace | 0020 | connections (khóa API) |

Mỗi đợt:
- feature branch → `merge --no-ff` vào `develop` → push;
- có test tự động và mục CHANGELOG;
- PM kiểm trên bản team trước khi vào `main`.

## Phụ thuộc

- W2 cần W1, để chọn Page / IG / Pixel mặc định.
- W4–W8 cần W3.
- W4 và W5 dùng mục tiêu của W2 nếu có, không có thì dùng trung bình tài khoản.
- W9 và W10 dùng chung một bộ "công cụ đọc", viết một lần ở `packages/core/agent`.
