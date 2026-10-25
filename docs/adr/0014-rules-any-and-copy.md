# ADR-0014: Rule tự động — điều kiện "HOẶC", mẫu tăng ngân sách ad set thắng, sao chép rule sang tài khoản khác

- Trạng thái: Đề xuất (chờ PM duyệt cùng PR develop → main)
- Ngày: 2026-10-24
- Sửa đổi: ADR-0012 mục 1 (điều kiện chỉ nối bằng VÀ)
- Liên quan: ADR-0010 (ngân sách ±15%), ADR-0012, roadmap B1 (PM chốt 23/10/2026 sau so sánh Bïrch / Madgicx)

## Bối cảnh
PM chọn mở rộng rule tự động (B1): điều kiện AND/OR, mẫu tăng ngân sách, nhật ký kích hoạt chi tiết, áp rule cho nhiều
tài khoản. ADR-0012 chỉ cho điều kiện nối bằng VÀ và một rule cho một tài khoản.

## Quyết định
1. **Kiểu khớp** `match ∈ {all, any}` (mặc định `all` — rule cũ giữ nguyên nghĩa). `any` = khớp khi **ít nhất một**
   điều kiện đúng. Không lồng nhóm, không biểu thức tự do (giữ ngôn ngữ tối giản của ADR-0012). Vẫn 1–6 điều kiện.
   Điều kiện đủ dữ liệu, cooldown 24 giờ, guardrails, giờ yên lặng, breaker, kill switch không đổi: kiểu khớp chỉ đổi
   tập đối tượng khớp, không đổi hành động được phép.
2. **Mẫu "Tăng ngân sách ad set thắng"** (`increase_budget_winner`, nguồn gợi ý `starved_winner`): cấp ad set, CPA giảm
   ≥ 20% so với 7 ngày trước **và** ≥ 10 kết quả → `set_adset_budget` **+15%** (mức tối đa ADR-0010). Theo ADR-0012
   mục 2: **bắt buộc trần ngân sách ngày** do người dùng nhập khi tạo; không có trần → không tạo được.
3. **Sao chép rule** sang tài khoản QC khác cùng workspace (Owner): mỗi bản sao là **một rule riêng cho một tài khoản**
   (giữ mô hình ADR-0012), luôn bắt đầu ở **chạy thử (shadow) 14 ngày**, không kế thừa trạng thái live. Danh sách
   loại trừ (`excludeMetaIds`) không sao chép (id đối tượng thuộc tài khoản gốc).
4. **Nhật ký kích hoạt chi tiết:** trang rule hiện từng lần đánh giá: đối tượng khớp + giá trị chỉ số lúc đó, việc sẽ
   làm / đã làm, lý do bị chặn (guardrail, cooldown…). Dữ liệu có sẵn ở `rule_evaluations`; không thêm bảng.

## Không làm
- Không có hành động mới (chỉ `pause_ad`, `pause_adset`, `set_adset_budget` như ADR-0012).
- Không nới ±15%, không bỏ shadow 14 ngày, không cho rule áp nhiều tài khoản trong cùng một bản ghi.

## Hệ quả
- Thêm cột `automation_rules.match` (migration, vùng bảo vệ `packages/db`) và chạm `packages/core/execution` (vùng bảo
  vệ): PM chạy staging trước khi merge main.
