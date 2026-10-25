# ADR-0026: Hành động ghi — tạo custom audience (pixel / tương tác) và tạo nhóm QC mới

- Trạng thái: **Chấp nhận** (PM 25/10/2026, gap sau khi đối chiếu Madgicx Academy: "Audience pixel + nhóm QC mới")
- Liên quan: ADR-0008 (Execution Gateway), ADR-0016 (tài sản Meta), ADR-0023 (Ad / Audience Launcher)
- Vùng bảo vệ: `packages/core/execution`, `packages/meta-client/write`
- Thực hiện:
  - CHANGELOG 125: custom audience;
  - CHANGELOG 126: nhóm QC mới.

## Quyết định

### 1. `create_custom_audience` (Audience Launcher)
- **Gọi Meta:** `POST /act_{id}/customaudiences` với `name`, `rule` (JSON), `prefill=1`.
- **Nguồn — chỉ tài sản đã đồng bộ của workspace** (ADR-0016):
  - **Website (pixel):**
    - pixel phải thuộc đúng tài khoản QC;
    - sự kiện: mọi lượt truy cập, PageView, ViewContent, AddToCart, InitiateCheckout, Purchase hoặc Lead;
    - giữ 1–180 ngày.
  - **Tương tác Page:** người đã tương tác với Page, giữ 1–365 ngày.
  - **Tương tác Instagram:** người đã tương tác với tài khoản Instagram doanh nghiệp, giữ 1–365 ngày.
- **Xác minh:** đọc lại audience vừa tạo; `subtype` phải là `WEBSITE` (pixel) hoặc `ENGAGEMENT` (Page / Instagram).
  - Lỗi giữa chừng: không đoán, không gọi lại; báo "kiểm tra thủ công".
- **Không hoàn tác** (giống lookalike): audience không tự tiêu tiền, người dùng xóa ở Meta nếu cần.

### 2. `create_adset` (bước 126)
- Tạo nhóm QC mới trong chiến dịch có sẵn, **luôn PAUSED**.
- **Thiết lập tối ưu** (`optimization_goal`, `billing_event`, `promoted_object`, chiến lược giá thầu) **chép từ một nhóm QC
  mẫu cùng chiến dịch**. Người dùng chỉ chọn:
  - tên;
  - audience (custom / lookalike của tài khoản);
  - quốc gia;
  - độ tuổi;
  - ngân sách ngày.
- **Guardrail:** ngân sách ngày ≤ ngân sách của nhóm QC mẫu × (1 + `maxBudgetChangePct`).
  - Nhóm QC mới PAUSED, nên chưa tiêu tiền.
  - Bật lên đi qua `resume_adset`, đủ guardrail.

### Chung
- **Chỉ `tier=approve`.** Rule tự động không bao giờ tạo (`no_auto_create`).
- **Guardrails giữ nguyên:**
  - số hành động / ngày;
  - kill switch;
  - breaker;
  - quyền ghi;
  - quyền duyệt theo Client;
  - cờ `p2a_approve`.

## Rủi ro
- **Audience sai nguồn:** chỉ chọn được tài sản đồng bộ của workspace; pixel phải thuộc tài khoản; ghi nhật ký.
- **Nhóm QC mới tiêu tiền ngoài ý muốn:**
  - tạo PAUSED;
  - ngân sách bị giới hạn theo nhóm QC mẫu;
  - bật lên cần duyệt riêng.
