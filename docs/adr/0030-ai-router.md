# ADR-0030: AI router — mỗi việc AI một model, nhiều khóa theo nhà cung cấp

- Trạng thái: **Chấp nhận** (PM 25/10/2026: "Triển khai AI router và nâng cấp bộ công cụ cho AI agent")
- Liên quan: ADR-0019 (AI agents), ADR-0022 (khóa AI tự mang), ADR-0027 (AI tạo ảnh), ADR-0031 (kế hoạch hành động)
- Vùng bảo vệ:
  - `packages/db`: `llm_keys` đổi ràng buộc duy nhất thành `(workspace_id, provider)`; bảng mới `llm_routes`;
  - không chạm `connections` (dùng lại `encryptSecret` / `decryptSecret`).
- Thực hiện:
  - CHANGELOG 134: core + worker;
  - CHANGELOG 135: giao diện cài đặt.

## Bối cảnh

- ADR-0022 cho mỗi workspace **một** khóa AI. Agent chat và AI tạo ảnh dùng chung khóa đó.
  - Workspace dùng Claude cho phân tích thì không tạo ảnh được: tạo ảnh cần khóa OpenAI.
- PM muốn định tuyến model theo việc: phân tích, viết nội dung, tạo ảnh… Mỗi model mạnh một việc và có giá khác nhau.
- PM hỏi có nên dựng MCP gateway. Kết luận: **không**.
  - MCP là giao thức để client bên ngoài gọi công cụ của AdxLens (ADR-0020), không phải lớp chọn model.
  - Định tuyến model là việc nội bộ của worker.

## Quyết định

**1. Việc AI (`LLM_TASKS`):**

| Việc          | Dùng ở đâu                                                  | Nhà cung cấp hợp lệ                     |
| ------------- | ----------------------------------------------------------- | --------------------------------------- |
| `analysis`    | AI agent chat có công cụ (vòng tool-use, kiểm số)            | anthropic, openai, gemini, deepseek     |
| `copywriting` | Viết nội dung quảng cáo (tiêu đề, nội dung chính) — ADR-0031 | anthropic, openai, gemini, deepseek     |
| `image`       | Tạo ảnh creative (ADR-0027)                                  | openai (`gpt-image-1`)                  |

- Tóm tắt báo cáo (khóa nền tảng) giữ nguyên, không qua router.

**2. Khóa:**
- Mỗi workspace có tối đa **một khóa cho mỗi nhà cung cấp**: duy nhất `(workspace_id, provider)`.
- Cột `model` của khóa là model chat mặc định của khóa đó.
- Mã hóa, giải mã chỉ trong worker, nhật ký `llm_key.saved` / `llm_key.deleted`: như ADR-0022.

**3. Định tuyến** (`app.llm_routes`, duy nhất `(workspace_id, task)`): việc → (nhà cung cấp, model).
- Chỉ Owner / Manager đổi; nhật ký `llm_route.saved` / `llm_route.deleted`.
- Không lưu route trỏ tới nhà cung cấp chưa có khóa, hay nhà cung cấp không làm được việc đó.
- Xóa một khóa → xóa các route đang trỏ tới nhà cung cấp đó.
- Không có route thì dùng mặc định:
  - `analysis`: khóa cập nhật gần nhất, với model mặc định của khóa;
  - `copywriting`: theo route `analysis`;
  - `image`: khóa OpenAI nếu có, model `gpt-image-1`.
- Workspace không có khóa riêng nào: `analysis` dùng khóa nền tảng như ADR-0019. `copywriting` và `image` **không bao giờ**
  dùng khóa nền tảng.
- Khóa workspace lỗi không rơi sang khóa nền tảng (giữ nguyên ADR-0022).

**4. Chính sách số theo việc (quy tắc 5, không nới):**
- `analysis`: mọi số trong câu trả lời phải có trong kết quả công cụ (như ADR-0019).
- `copywriting`: mọi số trong nội dung quảng cáo phải có trong **tin nhắn của chính người dùng** hoặc kết quả công cụ.
  - "Giảm 30%" chỉ được viết khi người dùng đã gõ 30.
  - Không lấy từ đoạn mô tả do model `analysis` truyền sang (model có thể tự bịa).
  - Phương án nào có số lạ thì bị loại, không sửa hộ.
- `image`: prompt do người dùng nhập; ảnh không mang số liệu báo cáo nên không kiểm số.

**5. Giới hạn chi phí:**
- `analysis`: 50 câu hỏi / người / ngày (ADR-0019, giữ nguyên).
- `copywriting`: tối đa 3 lần gọi trong một câu trả lời, mỗi lần tối đa 3 phương án.
- `image`: 3 ảnh đang tạo cùng lúc (ADR-0027), thêm **20 ảnh / workspace / 24 giờ**.

## Hệ quả

- Workspace dùng được Claude cho phân tích và OpenAI cho ảnh cùng lúc.
- Thêm việc AI mới, ví dụ dịch: chỉ cần thêm một dòng vào `LLM_TASKS` và chính sách số, không đổi schema.
- Chưa ghi nhận token / chi phí theo việc: ghi vào `docs/tech-debt.md`, làm khi có bảng giá theo model.
