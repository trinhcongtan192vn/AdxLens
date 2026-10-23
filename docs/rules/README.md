# Quy tắc audit (PRD 9.4, L2 5, L3 8)

Mỗi quy tắc là một file `packages/core/src/insight/rules/<rule_id>.ts` theo hợp đồng `Rule` (`packages/core/src/insight/types.ts`):

- `defaults`: ngưỡng mặc định (ghi đè ở `app.rule_configs`: dòng `workspace_id = null` cho toàn hệ thống, hoặc theo workspace).
- `minData`: điều kiện đủ dữ liệu; `detect` không trả gì khi thiếu dữ liệu.
- Mỗi phát hiện có bằng chứng (chỉ số hai cửa sổ), mức độ, tác động ước tính + cách tính (khóa i18n `rules.<id>.impact`), giải thích `rules.<id>.why` / `rules.<id>.what`.
- Cửa sổ so sánh: 7 ngày gần nhất (tới hôm qua theo múi giờ tài khoản) so với 7 ngày trước đó.
- Test bắt buộc: fixture phát hiện đúng + "không đủ dữ liệu thì không phát hiện".

Bảng ngưỡng từng quy tắc được thêm ở feature 016–017 (mục dưới). **PM duyệt ngưỡng** sau E4; đổi ngưỡng bằng `app.rule_configs`, không cần deploy.

## Ngưỡng mặc định (chờ PM duyệt sau E4)

| Quy tắc | Nhóm | Đủ dữ liệu khi | Phát hiện khi | Mức độ | Tác động |
|---|---|---|---|---|---|
| `creative_fatigue` | creative | mỗi cửa sổ ≥ 5 ngày có chi tiêu; tuần này ≥ 3.000 hiển thị; tuần trước ≥ 30 click liên kết | tần suất ≥ 2,5 và tăng ≥ 20%, CTR giảm ≥ 25% | high nếu CTR giảm ≥ 40%, còn lại medium | chi tiêu 7 ngày × mức giảm CTR |
| `budget_misallocation` | budget | ≥ 3 ad set cùng mục tiêu, mỗi ad set ≥ 5 kết quả | ad set chi tiêu ≥ 1.000.000đ (50 với tiền tệ khác) và ≥ 15% chi tiêu của mục tiêu, CPA ≥ 1,5× trung vị | high nếu ≥ 2× | chi tiêu × (1 − CPA trung vị / CPA) |
| `starved_winner` | budget | ad ≥ 5 kết quả; ad set ≥ 2 ad đang chạy | CPA ad ≤ 0,7× CPA ad set, chi tiêu ≤ 15% ad set | medium | không ước tính tiền |
| `fragmentation` | structure | campaign ≥ 4 ad set đang chạy; có ngân sách ngày hoặc trạng thái học | ≥ 4 ad set và ≥ 50% ad set có ngân sách < 100.000đ (5 với tiền tệ khác) hoặc học hạn chế | medium | không ước tính tiền |
| `learning_limited` | learning | ad set đang chạy ≥ 5 ngày có chi tiêu (suy luận cần đủ 7 ngày) | trạng thái học `LEARNING_LIMITED` từ API, hoặc không có trạng thái và < 50 kết quả/7 ngày | medium nếu ≥ 10% chi tiêu tài khoản, còn lại low | không ước tính tiền |
| `spend_no_conversion` | waste | ad set tối ưu chuyển đổi, ≥ 3 ngày chi tiêu; tài khoản có kết quả cùng mục tiêu ở nơi khác | chi tiêu 7 ngày ≥ 1.000.000đ (50 với tiền tệ khác) và 0 kết quả | high nếu ≥ 3× ngưỡng | toàn bộ chi tiêu 7 ngày |
| `account_hygiene` | hygiene | cấu trúc đã đồng bộ; "không chi tiêu" cần ≥ 7 ngày dữ liệu | đối tượng đang chạy có tên mặc định/bản sao; campaign/ad set đang bật mà 7 ngày không chi tiêu | low | không ước tính tiền |
| `conversion_tracking` | tracking | ≥ 17 ngày dữ liệu; nền ≥ 5 kết quả/ngày | kết quả 3 ngày gần nhất giảm ≥ 70% so với 14 ngày trước, chi tiêu và click giảm ≤ 30% | high | không ước tính tiền |
| Trùng lặp đối tượng | — | — | **Không triển khai**: Marketing API không trả dữ liệu audience overlap (PRD 9.4 "chỉ khi API có dữ liệu"); xem lại sau E4 | — | — |
