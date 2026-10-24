# ADR-0012: Rule tự động (P2b) — điều kiện, chế độ shadow → live, guardrails

- Trạng thái: Đề xuất (PM duyệt bắt buộc — tạo hành động `tier=auto` qua Execution Gateway)
- Ngày: 23/10/2026
- Liên quan: PRD 11 (P2-10..P2-14), L3 18 (`automation_rules`, `rule_evaluations`), ADR-0008..0011

## Quyết định
1. **Ngôn ngữ điều kiện tối giản, kiểm bằng zod:** một rule áp cho một tài khoản QC, ở một cấp (`ad` hoặc `adset`); danh sách điều kiện nối bằng **VÀ**. Mỗi điều kiện: `metric ∈ {spend, results, cpa, ctr, frequency, ctr_change_pct, cpa_change_pct}`, `op ∈ {gte, lte}`, `value` (chuỗi thập phân), cửa sổ 7 ngày gần nhất (so với 7 ngày trước cho chỉ số `_change_pct`). Không có biểu thức tự do, không gọi Meta khi đánh giá — chỉ đọc snapshot (`insights_daily`, `entities`).
2. **Hành động cho rule:** `pause_ad`, `pause_adset`, `set_adset_budget` với `change_pct` trong [−15, +15] (giới hạn guardrails mặc định; không vượt). **Không** có `resume_*`, `duplicate_adset` (ADR-0009, 0011). Ngân sách tăng chỉ khi đã có trần do người dùng đặt (`max_daily_budget` của rule); không có trần → chỉ cho giảm.
3. **Mẫu dựng sẵn** từ các loại gợi ý P1 (creative mệt, chi tiêu không chuyển đổi, CPA cao), sắp theo số gợi ý loại đó được đánh dấu "Đã làm" trong workspace.
4. **Chế độ:** tạo mới luôn ở `shadow` (chỉ ghi `would_do`); `paused`; `live` chỉ khi đã shadow ≥ 14 ngày, cờ `p2b_auto` bật, gói có quyền ghi, Owner/manager bật. Backtest 30 ngày trên snapshot trước khi lưu. Lệnh giả lập thời gian (`pnpm rules:simulate`) **chỉ chạy ở local**.
5. **Guardrails của rule** chỉ được chặt hơn guardrails hiệu lực của workspace. Hành động `auto` còn chịu giờ yên lặng, giới hạn số hành động/ngày, danh sách loại trừ, kill switch, breaker — đều qua gateway.
6. **Đánh giá:** shadow và live chạy mỗi 30 phút theo hàng đợi `rules`; mỗi lần ghi một dòng `rule_evaluations` (khớp đối tượng nào, sẽ làm / đã tạo hành động nào, bị guardrail chặn vì sao). Một đối tượng không bị cùng rule thao tác lại trong 24 giờ.

## Hệ quả
- Tắt cờ `p2b_auto` hủy hành động `auto` đang chờ (đã có ở 037) và dừng đánh giá live ở bước kiểm cờ đầu job.
- Hiệu quả tự động hóa (P215) = số hành động, tỷ lệ thành công, số lần hoàn tác (mục tiêu ≤ 5%), chi tiêu 7 ngày trước của đối tượng bị tạm dừng (ước tính, ghi rõ không phải nhân quả).
