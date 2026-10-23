# Weekly Action List — xếp hạng gợi ý (P1-04, PRD 10.3)

Nguồn: `packages/core/src/recommendation/weekly.ts`. Đổi giá trị cần task + cập nhật bảng này.

**Khi nào tạo:** thứ Hai 07:00 theo múi giờ workspace (job `recommend:build`, kiểm cờ `p1_recommendations` ở đầu job). Chạy lại cùng tuần cập nhật số liệu, giữ trạng thái và người được gán.

**Nguồn gợi ý**
- Phát hiện audit đang mở (`new`/`seen`, thấy trong 8 ngày qua) — hành động và lý do lấy từ quy tắc.
- Creative "Thua" → tắt/giảm phân bổ (tác động = chi tiêu × (1 − 1 / tỷ lệ CPA so trung vị); chưa có kết quả → toàn bộ chi tiêu). Creative "Winner" → tăng phân bổ (không ước tính tiền). Creative "Đang mệt" đã có ở phát hiện `creative_fatigue`, không lặp.

**Điểm ưu tiên** = tác động tương đối × độ tin cậy ÷ công sức (giờ) × hệ số "sai".
- Tác động tương đối = tác động tiền ÷ chi tiêu 7 ngày của tài khoản (tối đa 1). Không có tiền → theo mức độ: cao 10%, trung bình 5%, thấp 2%. Dùng tỷ lệ để so được giữa các tài khoản khác tiền tệ.
- Hệ số "sai": loại gợi ý có ≥ 3 lần quyết định (đã làm / bỏ qua) trong 90 ngày → 1 − tỷ lệ bỏ qua vì "sai", tối thiểu 0,3. Loại có ≥ 5 quyết định và tỷ lệ "sai" > 15% vào danh sách rà soát (`reviewQueue`).

| Loại | Độ tin cậy | Công sức |
|---|---|---|
| creative_fatigue | 70% | 30 phút |
| budget_misallocation | 60% | 15 phút |
| starved_winner | 50% | 10 phút |
| fragmentation | 50% | 45 phút |
| learning_limited | 60% | 20 phút |
| spend_no_conversion | 80% | 15 phút |
| account_hygiene | 90% | 10 phút |
| conversion_tracking | 80% | 30 phút |
| creative_loser | 60% | 10 phút |
| creative_winner | 50% | 15 phút |
| khác | 50% | 20 phút |

**Checklist cờ `p1_recommendations`:** Báo cáo (P0) đã bật ≥ 14 ngày; tỷ lệ phát hiện bị đánh dấu "sai" trong 30 ngày ≤ 20%.
