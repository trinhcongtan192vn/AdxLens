# ADR-0025: Hành động ghi — đổi tên, giá thầu nhóm QC, giới hạn chi tiêu chiến dịch

- Trạng thái: **Chấp nhận** (PM 25/10/2026, sau khi đối chiếu gap với Madgicx Academy: "Giá thầu + giới hạn chi +
  đổi tên")
- Liên quan:
  - ADR-0008 (Execution Gateway);
  - ADR-0009 / 0010 (trạng thái, ngân sách);
  - ADR-0015 (chiến dịch);
  - ADR-0024 (cờ toàn app × gói).
- Vùng bảo vệ: `packages/core/execution`, `packages/meta-client/write` (chỉ execution import).
- Thực hiện ở 2 bước:
  - CHANGELOG 119: đổi tên;
  - CHANGELOG 124: giá thầu + giới hạn chi.
- Hoàn tác chịu cùng guardrail: hạ giới hạn chi / giá thầu mạnh rồi hoàn tác (= nâng > ngưỡng) bị chặn, như ngân sách.

## Quyết định

### 1. Đổi tên — `rename_ad`, `rename_adset`, `rename_campaign`
- **Gọi Meta:** `POST /{id}` với `name`.
- **Trạng thái:** `before_state = { name }` lấy từ lần đồng bộ gần nhất.
  - Ngay trước khi ghi, đọc lại tên thật. Khác `before_state` thì không ghi đè (`state_changed`).
  - Tên trên Meta đã là tên mới thì không gọi Meta.
  - Verify bằng cách đọc lại `name`.
- **Kiểm tên:**
  - tên mới bỏ khoảng trắng hai đầu, dài 1–400 ký tự, không có ký tự điều khiển;
  - trùng tên hiện tại thì báo "không thay đổi".
- **Hoàn tác** được: đặt lại tên cũ.

### 2. Giá thầu nhóm QC — `set_adset_bid` (bước 124)
- **Gọi Meta:** `POST /{adset_id}` với `bid_amount`, là số nguyên theo đơn vị nhỏ nhất của tiền tệ, giống ngân sách.
- **Chỉ áp cho nhóm QC đang có `bid_amount`:** chiến lược Bid cap / Cost cap.
  - Nhóm QC dùng chiến lược thấp nhất / tự động thì báo `no_bid_amount`.
  - Không đổi chiến lược giá thầu.
- **Guardrail:** |thay đổi| ≤ `maxBudgetChangePct`.
  - Mặc định 15%; workspace chỉ được đặt chặt hơn.
  - Vi phạm thì báo `bid_change_too_large`.
- **Hoàn tác** được.

### 3. Giới hạn chi tiêu chiến dịch — `set_campaign_spend_cap` (bước 124)
- **Gọi Meta:** `POST /{campaign_id}` với `spend_cap`, đơn vị nhỏ nhất.
- **Hạ** giới hạn, hoặc đặt giới hạn cho chiến dịch chưa có: luôn được phép, vì đây là thêm phanh. Meta tự từ chối nếu
  mức thấp hơn số đã chi.
- **Nâng** giới hạn: |thay đổi| ≤ `maxBudgetChangePct`, vi phạm thì báo `spend_cap_change_too_large`.
- **Gỡ** giới hạn (bỏ phanh): không làm.
- **Hoàn tác** được (đặt lại mức cũ), chỉ khi trước đó đã có giới hạn.

### Chung cho cả 3 loại
- **Chỉ `tier=approve`.** Rule tự động không bao giờ tạo các hành động này (vi phạm `no_auto_edit`).
- **Guardrails giữ nguyên, không nới:** số hành động / ngày, ngày dữ liệu tối thiểu, loại trừ, kill switch, breaker,
  quyền ghi, quyền duyệt theo Client.
- **Cờ:** `p2a_approve`, đã gồm gói (ADR-0024).

## Rủi ro
- **Đổi tên nhầm:** làm rối báo cáo của agency.
  - Giảm thiểu: xem trước → duyệt; hoàn tác được; nhật ký ghi tên trước / sau.
- **Đổi giá thầu hoặc nâng giới hạn chi:** có thể làm tăng chi tiêu.
  - Giảm thiểu: giới hạn ±% như ngân sách; chỉ duyệt tay; xác minh bằng cách đọc lại.
