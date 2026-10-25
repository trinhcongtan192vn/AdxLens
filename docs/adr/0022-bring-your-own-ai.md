# ADR-0022: User dùng tài khoản AI của chính họ (khóa tự mang + connector MCP có OAuth)

- Trạng thái: **Chấp nhận** (PM chọn "Cả hai" ngày 25/10/2026)
- Ngày: 25/10/2026
- Liên quan: ADR-0019 (AI agents), ADR-0020 (MCP server)
- Vùng bảo vệ:
  - `packages/db`: bảng `llm_keys`, `oauth_clients`, `oauth_grants`;
  - `packages/core/connections`: chỉ thêm `encryptSecret` / `decryptSecret`, dùng lại khóa `TOKEN_ENC_KEY_V{n}`.

## Bối cảnh

PM muốn user dùng AI Agents bằng "OAuth của Claude Agent SDK hoặc OpenAI Agents SDK của chính user".

- **Claude:** Anthropic không cho bên thứ ba cung cấp đăng nhập claude.ai (gói Pro / Max) hay hạn mức gói cho sản phẩm
  của mình, kể cả agent xây trên Claude Agent SDK. Tài liệu SDK yêu cầu dùng API key.
- **OpenAI:** đăng nhập ChatGPT chỉ dành cho công cụ của OpenAI (Codex). Agents SDK dùng API key.

Vì vậy AdxLens **không** lấy token gói Claude / ChatGPT của user để gọi model.

Có 2 cách hợp lệ để user dùng tài khoản AI của mình. PM chọn làm cả hai.

## Quyết định

### A. Khóa AI tự mang (BYOK) cho trang AI Agents

**Lưu khóa:**
- Mỗi workspace có tối đa 1 khóa trong `app.llm_keys`. Cột: `provider` (`anthropic` | `openai`), `model`,
  `key_ciphertext`, `key_version`, `key_hint` (4 ký tự cuối), `last_used_at`, `last_error`.
- Khóa mã hóa AES-256-GCM bằng cùng khóa với token Meta (xoay khóa chung một chỗ).
- Web chỉ **mã hóa** lúc lưu; worker **giải mã** lúc chạy `recommend:agent_reply`.
- RLS bật, không có policy cho `authenticated` (giống `meta_connections`).

**Quyền:**
- Chỉ Owner / Manager lưu, đổi hoặc gỡ khóa (Cài đặt → Tích hợp, sau cờ `p1_recommendations`).
- API không bao giờ trả khóa rõ hay bản mã.
- Nhật ký chỉ ghi nhà cung cấp, model và 4 ký tự cuối.
- Kiểm dạng khóa theo nhà cung cấp (`sk-ant-…` / `sk-…`) để chặn dán nhầm.

**Chạy agent:**
- Workspace có khóa thì worker dùng khóa đó. Không có thì dùng khóa nền tảng `ANTHROPIC_API_KEY` (nếu có).
- Khóa workspace lỗi **không** rơi sang khóa nền tảng: agency đã chọn trả chi phí bằng tài khoản của mình, và lỗi phải
  hiện ra để họ sửa. Khi lỗi:
  - câu trả lời là bảng số (như ADR-0019);
  - tin nhắn và trang cài đặt ghi mã lỗi (`LLM_HTTP_401`…), không ghi thông điệp của nhà cung cấp, vì thông điệp đó có
    thể chứa khóa.
- OpenAI gọi Chat Completions có function calling, qua cùng giao diện `AgentLlm`. Vòng tool-use, bộ kiểm số (quy tắc 5),
  công cụ, cờ và giới hạn 50 câu / người / ngày giữ nguyên.
- Gọi bằng `fetch`, không thêm SDK.

### B. Connector MCP có OAuth 2.1 (dùng gói Claude / ChatGPT của user)

User thêm AdxLens làm **custom connector** trong claude.ai, Claude Desktop, Claude Code hoặc ChatGPT. Họ chat bằng gói
của chính họ, còn công cụ chạy trên AdxLens qua MCP (ADR-0020). Đây là cách Anthropic / OpenAI hỗ trợ chính thức cho
bên thứ ba. AdxLens không trả tiền LLM cho cách này.

**Discovery (MCP authorization spec 2025-06-18):**
- `/.well-known/oauth-protected-resource`: resource = `/api/v1/mcp`, authorization server = origin của app.
- `/.well-known/oauth-authorization-server`: authorize, token, registration, revocation.
- MCP trả `401` kèm `WWW-Authenticate: Bearer resource_metadata="…"`.

**Đăng ký client (Dynamic Client Registration, RFC 7591):**
- `POST /api/v1/oauth/register`. Chỉ client công khai (không secret, `token_endpoint_auth_method=none`).
- `redirect_uri` phải là `https`, hoặc `http://localhost` / `127.0.0.1` cho ứng dụng máy.
- Giới hạn tần suất theo IP.
- Bảng `app.oauth_clients` không thuộc workspace: client là ứng dụng (Claude, ChatGPT), không phải dữ liệu nghiệp vụ.

**Cấp quyền:**
- Trang `/oauth/authorize` (phải đăng nhập AdxLens) hiện tên ứng dụng, workspace, quyền xin, rồi Cho phép / Từ chối.
- Bắt buộc PKCE S256.
- Grant thuộc **một workspace và một người dùng**, chạy với quyền của người đó (buyer chỉ thấy Client được gán), giống
  khóa API.
- Phạm vi `read` luôn có. `propose` chỉ tác dụng khi cờ `p2a_approve` bật, và vẫn chỉ tạo thẻ đề xuất chờ duyệt.
  MCP không bao giờ ghi Meta.

**Token:**
- Mã cấp quyền 10 phút, dùng một lần. Access token 1 giờ. Refresh token 30 ngày, xoay mỗi lần dùng.
- Chỉ lưu SHA-256 của token (`app.oauth_grants`).
- Tra token là truy vấn xuyên workspace trước khi biết workspace, nên nằm ở `core/ops` có ghi chú lý do (như
  `resolveApiKey`).

**Quản lý:**
- Cài đặt → Tích hợp liệt kê ứng dụng đã kết nối.
- Người dùng thu hồi grant của mình; Owner / Manager thu hồi mọi grant trong workspace.
- Người dùng rời workspace thì grant ngừng.

**Cờ:** mỗi lời gọi MCP kiểm `p1_recommendations` (ADR-0020). Trang cấp quyền báo "chưa bật" khi cờ tắt.

## Hệ quả

- Agency có thể dùng AI Agents mà không phụ thuộc khóa nền tảng của AdxLens, hoặc dùng thẳng gói Claude / ChatGPT qua
  connector.
- Khóa của agency là bí mật cùng mức với token Meta: cùng mã hóa, cùng quy tắc log.
- Chưa làm: chọn khóa theo từng người dùng, hạn mức chi phí riêng cho từng khóa.
