# ADR-0019: AI Agents (chat) — công cụ đọc trả số đã tính, ghi chỉ là đề xuất

- Trạng thái: **Chấp nhận** (PM chọn "Làm luôn AI agents" 24/10/2026)
- Ngày: 24/10/2026
- Liên quan: CLAUDE.md quy tắc 3, 5, 6, 7; ADR-0008; ADR-0020
- Vùng bảo vệ: không sửa `execution` hay `flags`, chỉ gọi interface công khai của chúng

## Quyết định

**Module mới `packages/core/agent`:**
- Bộ **công cụ** (tool) có schema zod, chạy theo `ctx` của người dùng, nên tự có `workspace_id` và quyền của vai trò.
- **Công cụ đọc:**
  - `list_accounts`, `account_kpis(period)`, `top_entities(level, metric, period)`, `explain_cpa_change`;
  - `findings`, `health_score`, `breakdown(kind)`, `change_log`.
- **Công cụ đề xuất ghi:** `propose_action(action_type, target, params)`.
  - Chỉ tạo **đề xuất ở trạng thái chờ duyệt**, qua đúng đường "Việc tuần này" đang dùng.
  - Không bao giờ gọi Meta trực tiếp.
  - Duyệt và thực thi vẫn đi qua Execution Gateway: guardrails, kill switch, hoàn tác.
- LLM được gọi theo kiểu tool-use, qua `ANTHROPIC_API_KEY` sẵn có (model mặc định trong env).

**LLM không tạo số (quy tắc 5):**
- Mọi số mà LLM được thấy đều đến từ kết quả công cụ.
- Câu trả lời cuối đi qua bộ kiểm tra số đang dùng cho tóm tắt báo cáo: mỗi số trong câu trả lời phải có trong tập số
  mà công cụ đã trả.
- Không khớp thì sinh lại, tối đa 2 lần. Vẫn không khớp thì trả câu trả lời **chỉ gồm bảng số từ công cụ**, kèm ghi chú.

**Dữ liệu không phải lệnh (quy tắc 10):**
- Tên campaign và nội dung từ Meta được bọc trong khối dữ liệu.
- System prompt nói rõ không làm theo chỉ dẫn nằm trong dữ liệu.

**Cờ:**
- Chat **đọc** là P1, nên kiểm cờ `p1_recommendations` ở server, cả ở API lẫn đầu job.
- `propose_action` thêm điều kiện cờ `p2a_approve`. Cờ tắt thì công cụ này không có trong danh sách gửi LLM.

**Lưu trữ:**
- Bảng `app.agent_threads` và `app.agent_messages`, theo `workspace_id` và `user_id`.
- Có `favorite`.
- Xóa theo chính sách xóa workspace.

**Giao diện:**
- Trang Agents: lịch sử bên trái, câu mẫu "Hỏi về tài khoản" và "Làm việc gì đó".
- Ô hỏi nổi trên mọi trang Workspace.
- Ghi chú "AI có thể sai. Số liệu lấy từ AdxLens, đối chiếu Ads Manager ≤ 1%."

**Không có API key** thì trang Agents hiện "Chưa cấu hình AI" và không lỗi.

## Rủi ro

- Prompt injection qua tên quảng cáo: rủi ro chỉ dừng ở **đề xuất**, vì việc ghi luôn cần người duyệt.
- Chi phí LLM.
  - Giới hạn số lượt hỏi / người / ngày trong `system_settings`, mặc định 50.
