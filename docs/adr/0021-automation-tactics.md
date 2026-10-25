# ADR-0021: Tactic tự động kiểu Madgicx (Stop-loss, Surf, Sunsetting, Revive)

- Trạng thái: **Chấp nhận** (PM: "Phần có ghi Meta thì cũng làm luôn", 25/10/2026). Phần "tự bật lại" giữ nguyên
  guardrail, xem mục 3.
- Ngày: 25/10/2026
- Liên quan:
  - ADR-0008 (Execution Gateway), ADR-0012 (rule tự động), ADR-0014 (rule ANY + sao chép);
  - `docs/research/madgicx-2026-10.md` mục 3.1, 3.2.
- Vùng bảo vệ:
  - `packages/core/execution`: gateway, rule;
  - `packages/db`: bảng `scheduled_reverts`.
  - Cần PM chạy integration test trên staging trước khi merge `main`.

## Bối cảnh

Rule P2b chỉ có một bước: điều kiện → tạm dừng / đổi ngân sách. Madgicx có 4 tactic dựng sẵn, cần **hành động hẹn giờ**
hoặc **nhiều bước**:

| Tactic | Cấp | Madgicx |
|---|---|---|
| Stop-loss | ad / ad set | Dừng khi đà xấu trong ngày, tự bật lại lúc 00:00 |
| Surf | ad set | Tăng ngân sách khi đà tốt, tự trả về vào giờ chọn |
| Sunsetting | ad set | Giảm ngân sách dần nhiều bước tới sàn |
| Revive | ad / ad set | Bật lại đối tượng đã dừng khi có dấu hiệu sinh lời lại |

## Quyết định

### 1. Dữ liệu và chỉ số

- Rule vẫn đánh giá trên snapshot đã đồng bộ (ngày dữ liệu gần nhất = hôm qua theo múi giờ tài khoản). AdxLens không
  đồng bộ trong ngày, nên "Stop-loss trong ngày" thành **"dừng sau một ngày xấu"**. Trang ghi rõ điều này.
- Thêm chỉ số rule:
  - 7 ngày: `link_clicks`, `roas`;
  - 1 ngày (hôm qua): `spend_1d`, `results_1d`, `link_clicks_1d`, `cpa_1d`, `roas_1d`.

### 2. Hành động hẹn giờ (`app.scheduled_reverts`)

- Khi rule live tạo hành động có cấu hình `revert`, gateway ghi một dòng `scheduled_reverts` (`due_at` theo giờ tài
  khoản).
- Job `maintenance:reverts_tick` chạy mỗi 15 phút, đưa các dòng đến hạn vào hàng đợi `execute:revert`.
- **`restore_budget` (Surf):**
  - tạo hành động `tier=auto` trả ngân sách về `before_state` của hành động gốc, qua **đủ** guardrails, kill switch,
    breaker, quyền ghi, verify;
  - `before_state` của hành động trả về = `after_expected` của hành động gốc. Người dùng đã sửa tay thì worker thấy
    lệch và không ghi (`state_mismatch`).
  - Chỉ bỏ cooldown 24 giờ cùng rule cho đúng hành động trả về này, vì nó đưa đối tượng về trạng thái trước rule (như
    hoàn tác). Mọi guardrail trong `checkGuardrails` vẫn áp dụng: ±15%, số hành động / ngày, giờ yên tĩnh, loại trừ.
- **`suggest_undo` (Stop-loss, Revive):** gửi thông báo cho Owner / Manager kèm link **Hoàn tác** của hành động tạm
  dừng. Người dùng bấm thì hoàn tác đi qua luồng duyệt tay như hiện nay.
- Giờ hẹn phải nằm ngoài giờ yên tĩnh (mặc định 06:00–21:59). "Bật lại 00:00" của Madgicx thành **sáng hôm sau, giờ
  chọn ≥ 06:00**.

### 3. Không tự bật lại (giữ guardrail `no_auto_resume`)

- Guardrail mặc định cấm `tier=auto` bật lại đối tượng (khóa bằng test). Quy tắc tuyệt đối 6 không cho nới.
- Vì vậy Stop-loss và Revive **đề xuất** bật lại (thông báo + Hoàn tác 1 bấm), không tự ghi.
- Muốn tự bật lại thì cần PM quyết riêng việc nới guardrail và một ADR mới.

### 4. Bốn mẫu rule mới (vẫn tạo ở `shadow` 14 ngày như ADR-0012)

| Mẫu | Điều kiện mặc định | Hành động |
|---|---|---|
| `stop_loss_no_clicks` (ad) | `spend_1d ≥ 2 × CPC 30 ngày` và `link_clicks_1d ≤ 0` | Tạm dừng; sáng hôm sau đề xuất bật lại |
| `surf_winner` (ad set) | `roas_1d ≥ 2` và `roas ≥ 1.5` | +15% (trần ngân sách bắt buộc); tự trả về lúc 21:00 |
| `sunset_loser` (ad set) | `cpa_change_pct ≥ 30` và `results ≥ 3` | −15%, không dưới **sàn ngân sách** (bắt buộc); 1 lần / 48 giờ |
| `revive_paused` (ad) | Đối tượng **do rule dừng** trong 7 ngày, `cpa ≤` ngưỡng | Đề xuất bật lại (không ghi Meta) |

Ràng buộc chung:
- Sàn ngân sách: ngân sách mới = max(sàn, ngân sách × (1 − %)). Đã chạm sàn thì bỏ qua (`at_floor`).
- `cooldownHours` của rule chỉ được ≥ 24 (chặt hơn).
- Revive không bao giờ đề xuất bật lại đối tượng người dùng tự dừng (PRD 11.2.6), và tối đa 1 đề xuất / hành động.

### 5. Chưa làm

- Rule cấp chiến dịch: cần hành động trạng thái chiến dịch (ADR-0015, chưa duyệt).
- Lịch theo ngày / giờ trong tuần.
- Chạy theo dữ liệu trong ngày (cần đồng bộ nhiều lần / ngày).

## Rủi ro

- Trả ngân sách đè lên chỉnh tay. Giảm thiểu: so trạng thái thật với `after_expected`, lệch thì không ghi.
- Surf làm vượt ngân sách tháng. Giảm thiểu: trần ngân sách bắt buộc, ±15%, cảnh báo pacing A3.
- Đề xuất bật lại gây phiền. Giảm thiểu: chỉ đối tượng do rule dừng, 1 đề xuất / hành động, tắt được ở cài đặt
  thông báo.
