# ADR-0020: MCP server cho AdxLens

- Trạng thái: **Chấp nhận** (PM chọn "triển khai tương tác theo MCP" 24/10/2026)
- Ngày: 24/10/2026
- Liên quan: ADR-0019 (dùng chung bộ công cụ)
- Vùng bảo vệ: bảng khóa API mới (`packages/db`)

## Quyết định

**Endpoint:** `POST /api/v1/mcp` (Streamable HTTP, JSON-RPC 2.0, phương thức `initialize`, `tools/list`, `tools/call`)
trong `apps/web`. Route chỉ:
1. xác thực khóa;
2. dựng `ctx` theo workspace;
3. gọi `packages/core/agent`.

**Xác thực bằng khóa API theo workspace:**
- Bảng `app.api_keys`: `workspace_id`, `created_by`, `name`, `prefix`, `hash` (SHA-256), `scopes`, `last_used_at`,
  `revoked_at`.
- Khóa chỉ hiện **một lần** lúc tạo. Không lưu plaintext, không log.
- Owner / Manager tạo và thu hồi khóa trong Cài đặt → Tích hợp.
- Khóa chạy với quyền của **người tạo** trong workspace đó. Người tạo mất quyền thì khóa ngừng.

**Công cụ:**
- Cùng bộ với ADR-0019.
- `propose_action` chỉ có khi khóa có scope `propose` **và** cờ `p2a_approve` bật. Kết quả vẫn chỉ là đề xuất chờ duyệt
  trong app.
- MCP **không** bao giờ thực thi ghi.

**Cờ:** MCP là P1, nên kiểm `p1_recommendations` ở server trên mỗi request.

**Giới hạn:** 60 lời gọi / phút / khóa, dùng Redis như auth throttle.

**Vị trí code (khi làm, 24/10/2026):**
- Tạo / liệt kê / thu hồi khóa và xử lý JSON-RPC ở `packages/core/agent` (`api-keys.ts`, `mcp.ts`).
- Tra khóa theo hash là **truy vấn xuyên workspace** (bước xác thực, chưa biết workspace), nên đặt ở
  `packages/core/ops/api-keys.ts` có ghi chú lý do (CLAUDE.md quy tắc 1).
- Đề xuất từ MCP lưu thành thẻ trong hội thoại "MCP · <tên khóa>" của người tạo khóa, duyệt như ADR-0019.
- Máy chủ không trạng thái: `POST` JSON-RPC đơn (không batch), notification trả 202, `GET` trả 405.

## Rủi ro

- Khóa bị lộ thì lộ dữ liệu số liệu của workspace.
  - Giảm thiểu: chỉ đọc; thu hồi ngay được; có `last_used_at`; có nhật ký `audit_events` cho mỗi lần tạo / thu hồi.
