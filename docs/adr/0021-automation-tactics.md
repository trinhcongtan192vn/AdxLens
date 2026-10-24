# ADR-0021: Tactic tự động kiểu Madgicx (Stop-loss trong ngày, Surf, Sunsetting, Revive)

- Trạng thái: **Đề xuất** (cần PM duyệt — hành vi ghi Meta mới qua rule P2b, vùng `packages/core/execution`)
- Ngày: 25/10/2026
- Liên quan:
  - ADR-0008 (Execution Gateway), ADR-0012 (rule tự động), ADR-0014 (rule ANY + sao chép);
  - `docs/research/madgicx-2026-10.md` mục 3.1 và 3.2.

## Bối cảnh

Rule P2b hiện chỉ có một bước: điều kiện → tạm dừng / bật lại / đổi ngân sách. Madgicx có 4 tactic dựng sẵn được dùng
nhiều, tất cả cần **hành động hẹn giờ** hoặc **nhiều bước**:

| Tactic | Cấp | Hành vi |
|---|---|---|
| **Stop-loss trong ngày** | ad / ad set | Tạm dừng khi đà xấu trong ngày (vd. chi > X mà 0 click / 0 kết quả). **Tự bật lại lúc 00:00** giờ tài khoản, hoặc sớm hơn nếu kết quả cải thiện (attribution trễ). |
| **Surf** | ad set | Tăng ngân sách vượt mức khi đà tốt (ROAS hôm nay + hôm qua > ngưỡng). **Tự trả ngân sách cũ** vào giờ chọn. |
| **Sunsetting** | ad set | Giảm ngân sách dần nhiều bước (vd. −20% mỗi 2 ngày) khi hiệu quả giảm; dừng khi chạm sàn. |
| **Revive** | ad / ad set | Bật lại đối tượng đã dừng khi số liệu gần đây có dấu hiệu sinh lời trở lại. |

## Đề xuất

**Hành động hẹn giờ (`scheduled_revert`):**
- Khi rule thực hiện một hành động có `revertAt`, Gateway lưu thêm một hành động "đảo ngược" ở trạng thái `scheduled`
  kèm `before_state` hiện tại.
- Một job mỗi 15 phút thực hiện các hành động đến giờ. Hành động này vẫn đi qua đủ guardrails, kill switch và verify.
- Nếu trạng thái thật đã khác `after_state` của hành động gốc (có người sửa tay), thì **không đảo ngược** và ghi
  `skipped_manual_change`.

**Bốn template mới** trong thư viện rule, đều tạo ở chế độ `shadow` như hiện nay:
- **Stop-loss:** điều kiện trong ngày; `revertAt = 00:00` giờ tài khoản.
- **Surf:** `changePct` dương, `maxDailyBudget` bắt buộc; `revertAt` = giờ người dùng chọn.
- **Sunsetting:** `changePct` âm, có `floorDailyBudget`; mỗi đối tượng tối đa 1 lần / 48 giờ.
- **Revive:** bật lại chỉ đối tượng **do rule dừng** trong 7 ngày (không bao giờ bật lại đối tượng người dùng tự
  dừng — PRD 11.2.6).

**Guardrails:** không nới.
- Mọi giới hạn hiện có vẫn áp dụng: số hành động / ngày, giờ yên tĩnh, cooldown, ±% ngân sách.
- Hành động đảo ngược tính vào hạn mức hành động / ngày.

## Rủi ro

- Đảo ngược đè lên chỉnh tay của người dùng.
  - Giảm thiểu: so `after_state` trước khi đảo ngược; bỏ qua nếu đã khác.
- Surf làm vượt ngân sách tháng.
  - Giảm thiểu: `maxDailyBudget` bắt buộc; cảnh báo pacing A3.
- Revive bật lại đối tượng người dùng muốn tắt hẳn.
  - Giảm thiểu: chỉ đối tượng do rule dừng; tối đa 1 lần / 7 ngày.

## Cần PM quyết

1. Có làm hành động hẹn giờ không? Đây là thay đổi lớn nhất (vùng `execution`, cần chạy integration test trên staging).
2. Thứ tự làm 4 template. Đề xuất: **Stop-loss trong ngày** trước, vì được dùng nhiều nhất và rủi ro thấp nhất.
