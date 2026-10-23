# Quy tắc audit (PRD 9.4, L2 5, L3 8)

Mỗi quy tắc là một file `packages/core/src/insight/rules/<rule_id>.ts` theo hợp đồng `Rule` (`packages/core/src/insight/types.ts`):

- `defaults`: ngưỡng mặc định (ghi đè ở `app.rule_configs`: dòng `workspace_id = null` cho toàn hệ thống, hoặc theo workspace).
- `minData`: điều kiện đủ dữ liệu; `detect` không trả gì khi thiếu dữ liệu.
- Mỗi phát hiện có bằng chứng (chỉ số hai cửa sổ), mức độ, tác động ước tính + cách tính (khóa i18n `rules.<id>.impact`), giải thích `rules.<id>.why` / `rules.<id>.what`.
- Cửa sổ so sánh: 7 ngày gần nhất (tới hôm qua theo múi giờ tài khoản) so với 7 ngày trước đó.
- Test bắt buộc: fixture phát hiện đúng + "không đủ dữ liệu thì không phát hiện".

Bảng ngưỡng từng quy tắc được thêm ở feature 016–017 (mục dưới). **PM duyệt ngưỡng** sau E4; đổi ngưỡng bằng `app.rule_configs`, không cần deploy.
