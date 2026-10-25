# ADR-0017: Mục tiêu KPI, chỉ số phụ, ngành và tài sản mặc định theo Client

- Trạng thái: **Chấp nhận** (PM chọn "Theo Client" trong MCQ 24/10/2026)
- Ngày: 24/10/2026
- Liên quan: ADR-0016, `docs/research/madgicx-2026-10.md` mục 5.2–5.4
- Vùng bảo vệ: `packages/db` (bảng mới, migration)

## Quyết định

**Bảng mới `app.client_goals`.** Mỗi Client có tối đa một dòng (`unique(workspace_id, client_id)`). Các cột:

| Cột | Nội dung |
|---|---|
| `primary_metric` | Một trong: `cpa`, `roas`, `cpl`, `cpc`, `cpm`, `ctr`, `cost_per_purchase`, `purchase_value` |
| `primary_target` | Mục tiêu, kiểu `numeric`. Tiền tính theo tiền tệ của tài khoản, tỷ lệ tính theo % |
| `secondary_metrics` | Mảng 0–2 chỉ số, cùng danh sách với `primary_metric` |
| `industry`, `sub_industry` | Mã ngành trong danh mục cố định của code (`lib/industries`), không nhận chuỗi tự do |
| `default_page_id`, `default_instagram_id`, `default_pixel_id` | Lấy từ `meta_assets` (ADR-0016) |
| `onboarded_at` | `timestamptz`; null nghĩa là Client chưa làm onboarding |

**Truy vấn:** mọi truy vấn lọc theo `workspace_id`. Bảng được thêm vào RLS và vào bộ test cách ly workspace.

**Gợi ý mục tiêu bằng số thực tế:**
- Core tính chỉ số chính cho **hôm qua / 7 ngày / 30 ngày**, từ `insights_daily` của các tài khoản thuộc Client.
- Công thức chỉ số dùng nguyên định nghĩa hiện có, không đổi định nghĩa (quy tắc 4).
- Không dùng LLM.

**Nơi dùng mục tiêu, làm dần qua các đợt:**
- KPI có cột "so với mục tiêu" trên Home, trang Client và báo cáo.
- "Khách cần chú ý" khi lệch mục tiêu quá 20%.
- Gợi ý ngưỡng alert (ADR-0018).

Rule audit **chưa** chuyển sang dùng mục tiêu. Việc đó làm ở đợt sau, có ADR riêng, vì nó đổi hành vi phát hiện.

**Khi nào hỏi onboarding:**
- Sau khi xác nhận gán tài khoản cho Client (S05), hiện màn 3 bước giống Madgicx: mục tiêu → chỉ số phụ → ngành và tài
  sản. Có nút "Để sau".
- Sửa lại bất cứ lúc nào ở trang Client → tab "Mục tiêu".

## Rủi ro

- Mục tiêu sai tiền tệ khi một Client có nhiều tài khoản khác tiền tệ.
  - Giảm thiểu: lưu kèm `currency`. Gợi ý chỉ tính trên các tài khoản cùng tiền tệ, và giao diện cảnh báo khi có tiền
    tệ khác.
