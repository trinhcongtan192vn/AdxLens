# ADR-0031: Kế hoạch hành động — agent soạn chuỗi tạo quảng cáo, người dùng duyệt một lần

- Trạng thái: **Chấp nhận** (PM 25/10/2026: "Triển khai AI router và nâng cấp bộ công cụ cho AI agent"; trước đó PM hỏi
  ra lệnh cho agent qua chat để tạo ads)
- Liên quan:
  - ADR-0008 (Execution Gateway);
  - ADR-0019 (AI agents);
  - ADR-0023 / 0026 / 0027 (Launcher: quảng cáo, nhóm QC, creative);
  - ADR-0030 (AI router).
- Vùng bảo vệ:
  - `packages/db`: bảng `action_plans`;
  - `packages/core/execution`: kế hoạch, tách bước kiểm của `requestLaunch`, ghi nhóm QC mới vào bản chụp cấu trúc.
- Thực hiện:
  - CHANGELOG 137: core + job;
  - CHANGELOG 138: công cụ agent + thẻ kế hoạch trong chat.

## Bối cảnh

- Tạo một quảng cáo là chuỗi bước phụ thuộc nhau: creative (từ ảnh) → nhóm QC → quảng cáo.
  - Bước sau cần id Meta do bước trước tạo ra.
- `propose_action` (ADR-0019) chỉ đề xuất được **một** thay đổi trên đối tượng đã có.
- Bắt người dùng duyệt ba lần cho một việc thì rườm rà. Cho agent tự chạy thì trái nguyên tắc "agent chỉ đề xuất".

## Quyết định

**1. Kế hoạch** (`app.action_plans`, theo workspace + tài khoản QC):
- Gồm:
  - danh sách bước có thứ tự, tối đa 6;
  - trạng thái `proposed` → `approved` → `running` → `done` | `failed`, hoặc `canceled`;
  - người tạo, nguồn (`agent` + id tin nhắn), người duyệt;
  - kết quả từng bước.
- Hết hạn sau **24 giờ** nếu chưa duyệt.
- **Bước:** một trong `create_creative`, `create_adset`, `create_ad`, với tham số như Launcher.
  - Bước sau tham chiếu bước trước bằng `{ "ref": "<khóa bước>" }`, ví dụ quảng cáo dùng creative và nhóm QC vừa tạo.
  - Chỉ tham chiếu được bước đứng trước, và đúng loại: `create_ad.creative` → bước `create_creative`, `create_ad.adset`
    → bước `create_adset`.

**2. Ai làm gì:**
- **Agent:** chỉ **tạo** kế hoạch `proposed` qua công cụ `propose_ad_plan`, sau cờ `p2a_approve`. Agent không duyệt,
  không chạy, không sửa.
- **Người duyệt:**
  - Phải có quyền duyệt hành động cho Client của tài khoản, như Launcher.
  - Thấy **đủ mọi tham số**: tên, ngân sách, quốc gia, tuổi, audience, link, nội dung, CTA, ảnh.
  - Bấm duyệt **một lần**.
- **Client MCP bên ngoài** (sau này): cũng chỉ được tạo kế hoạch `proposed`. Duyệt luôn ở trong AdxLens.

**3. Kiểm khi duyệt:**
- Mọi bước không có tham chiếu chạy đúng các kiểm tra của `requestLaunch`:
  - nguồn thuộc workspace;
  - ảnh sẵn sàng, link https;
  - guardrails (ngân sách nhóm QC mới…);
  - kill switch, breaker.
- Có vi phạm → không duyệt được, báo vi phạm từng bước.
- Bước có tham chiếu được kiểm lại đủ lúc chạy, khi đã có id thật.

**4. Chạy** (job `execute:plan`, worker; kiểm cờ ở đầu job):
- Từng bước tuần tự:
  1. thay tham chiếu bằng id do bước trước tạo ra;
  2. tạo hành động duyệt tay qua Execution Gateway, với `plan_id` trong tham số;
  3. thực hiện ngay trong job: đọc lại trạng thái trước khi ghi, xác minh sau khi ghi.
- Mỗi bước là một hành động trong Nhật ký như Launcher. Guardrails, kill switch, giới hạn số hành động / ngày áp dụng
  **cho từng bước**, không có đường tắt.
- Một bước lỗi → dừng; các bước sau `skipped`.
  - Đối tượng đã tạo vẫn giữ.
  - Nhóm QC và quảng cáo mới luôn **PAUSED**, creative không tiêu tiền → không có chi tiêu ngoài ý muốn.
  - Không tự hoàn tác.
- Nhóm QC mới được ghi ngay vào bản chụp cấu trúc, như creative ở ADR-0027, để bước quảng cáo tìm thấy.

**5. Văn bản do AI viết** (tiêu đề, nội dung chính):
- Do việc `copywriting` sinh ra, theo chính sách số của ADR-0030.
- Người duyệt luôn thấy nguyên văn trước khi duyệt.
- Văn bản trong dữ liệu (tên chiến dịch, phản hồi Meta) là dữ liệu, không phải lệnh (quy tắc 10). Kế hoạch không bao giờ
  tự chạy, nên chỉ dẫn cài trong dữ liệu không thể tạo quảng cáo nếu không có người duyệt.

**6. Bật quảng cáo:** không nằm trong kế hoạch. Người dùng bật sau, bằng hành động thường (`resume_ad`, có hoàn tác).

## Hệ quả

- "Tạo quảng cáo từ ảnh X cho nhóm khách Y, ngân sách Z" trong chat → một thẻ kế hoạch → duyệt một lần → theo dõi từng
  bước ngay trong chat.
- AI tạo ảnh ngay trong kế hoạch (bước sinh ảnh chạy nền) chưa làm. Hiện kế hoạch dùng ảnh đã sẵn sàng ở thư viện
  creative.
