# ADR-0023: Ad Launcher (tạo quảng cáo từ creative có sẵn) và Audience Launcher (tạo lookalike)

- Trạng thái: **Chấp nhận** (PM: "Phần có ghi Meta thì cũng làm luôn", 25/10/2026)
- Ngày: 25/10/2026
- Liên quan: ADR-0008 (Execution Gateway), ADR-0011 (nhân bản ad set), `docs/research/madgicx-2026-10.md` mục 3.4
- Vùng bảo vệ:
  - `packages/core/execution`, `packages/meta-client/write`;
  - cần PM chạy integration test trên staging trước khi merge `main`.

## Bối cảnh

Madgicx có:
- **Ad Launcher**: chọn ad set có sẵn, chọn creative tốt nhất (sắp theo ROAS), tạo quảng cáo.
- **Audience Launcher**: tạo đối tượng dựng sẵn theo giai đoạn phễu (lookalike, khách truy cập web…).

AdxLens đã có thư viện creative (P103) và danh sách custom audience (091).

## Quyết định

### Hai loại hành động ghi mới

Cả hai chỉ ở tier `approve` (duyệt tay). Guardrail chặn `tier=auto`: thêm `no_auto_create` (chặt hơn, không nới).

- **`create_ad`**:
  - tạo quảng cáo trong ad set chọn, dùng **creative có sẵn** (`creative_id`) của chính tài khoản;
  - quảng cáo mới luôn **PAUSED**; người dùng bật bằng thao tác bật như hiện nay;
  - Meta: `POST act_<id>/ads {name, adset_id, creative: {creative_id}, status: PAUSED}`;
  - xác minh: đọc lại quảng cáo mới, phải là PAUSED và đúng ad set;
  - lỗi giữa chừng: không đoán, không gọi lại, báo kiểm tra thủ công (như nhân bản).
- **`create_lookalike`**:
  - tạo lookalike từ **custom audience có sẵn** của tài khoản (`origin_audience_id`), quốc gia ISO, tỷ lệ 1–10%;
  - Meta: `POST act_<id>/customaudiences {name, subtype: LOOKALIKE, origin_audience_id, lookalike_spec}`;
  - xác minh: đọc lại audience mới (subtype LOOKALIKE). Không đụng ngân sách hay quảng cáo đang chạy.

### Kiểm tra

- Creative / audience gốc phải thuộc tài khoản QC của workspace, đọc từ snapshot. Ad set phải thuộc tài khoản đó.
- Không hoàn tác được (như nhân bản). Muốn bỏ thì người dùng tạm dừng quảng cáo.
- Đủ cổng: cờ `p2a_approve`, gói, kill switch, breaker, quyền ghi, giới hạn số hành động / ngày.
- Cột `actions.target_type` thêm giá trị `account` cho `create_lookalike` (mục tiêu là tài khoản QC).

### Chưa làm

- Tạo creative mới (ảnh / video / chữ mới) và AI Ad Generator: cần lưu trữ file và mô hình tạo ảnh, cần quyết định
  nhà cung cấp.
- Audience theo pixel / tương tác (website, video viewers): cần đặc tả rule pixel. Sẽ làm sau theo nhu cầu.

## Rủi ro

- Tạo nhầm hàng loạt. Giảm thiểu: duyệt từng hành động, giới hạn hành động / ngày, quảng cáo tạo ra ở PAUSED.
- Lookalike tạo ra nhưng không dùng. Rủi ro thấp: không tốn tiền, Meta tự xóa audience không dùng.
