# Phân loại creative (P1-03) và dự báo mệt (P1-07)

Nguồn: `packages/core/src/recommendation/creatives.ts` (`CREATIVE_THRESHOLDS`). Đổi ngưỡng cần task + cập nhật bảng này.

Creative được gom theo **creative gốc** (`ad.creative_id`) trong **một tài khoản QC**; chỉ số là tổng các ad dùng creative đó trong kỳ đã chọn (ngày theo múi giờ tài khoản).

| Nhãn | Điều kiện (xét theo thứ tự) |
|---|---|
| Chưa đủ dữ liệu | < 1.000 hiển thị hoặc < 3 ngày có chi tiêu trong kỳ |
| Đang mệt | **đúng điều kiện rule `creative_fatigue`** (dùng chung một bộ ngưỡng, có test khóa): mỗi cửa sổ 7 ngày ≥ 5 ngày chi tiêu; tuần này ≥ 3.000 hiển thị; tuần trước ≥ 30 click liên kết; tần suất ≥ 2,5 và tăng ≥ 20%; CTR giảm ≥ 25% |
| Cần theo dõi (thiếu đối chiếu) | < 3 creative cùng loại kết quả có ≥ 3 kết quả → không có trung vị để so |
| Winner | ≥ 5 kết quả và CPA ≤ 0,8 × trung vị CPA các creative cùng loại kết quả |
| Thua | CPA ≥ 1,5 × trung vị; hoặc 0 kết quả mà chi tiêu ≥ 2 × CPA trung vị |
| Cần theo dõi | còn lại |

**Dự báo mệt (ghi rõ là dự báo):** chỉ với creative không ở nhãn "Đang mệt"/"Chưa đủ dữ liệu"; cần ≥ 10 trong 14 ngày gần nhất có ≥ 200 hiển thị. Hồi quy tuyến tính CTR theo ngày; nếu đang giảm, tính số ngày tới khi CTR chạm 75% CTR trung bình 7 ngày đầu (cùng mức giảm 25% của rule mệt). Chỉ hiện khi ≤ 7 ngày.

Tiền (chi tiêu, CPA) tính bằng số thập phân; CTR, tần suất, tỷ lệ so trung vị là tỷ lệ hiển thị.
