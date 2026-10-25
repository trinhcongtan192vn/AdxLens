# ADR-0015: Hành động ghi — tạm dừng / bật lại chiến dịch

- Trạng thái: **Chấp nhận** (PM: "Phần có ghi Meta thì cũng làm luôn", 25/10/2026; làm ở CHANGELOG 108). Chưa làm: hộp
  thoại hiện số ad set bên dưới và chi tiêu 7 ngày (hiện có cảnh báo chung).
- Ngày: 24/10/2026
- Liên quan: ADR-0008 (Execution Gateway), ADR-0009 (tạm dừng / bật lại ad, ad set), CHANGELOG 063 (G4)

## Bối cảnh
G4 cho tạm dừng / bật lại ad và ad set ngay trên bảng. Nhưng chiến dịch thì chưa có thao tác ghi nào. Nếu chiến dịch đang tạm dừng, các ad set và ad bên dưới có trạng thái hiệu lực `CAMPAIGN_PAUSED`: bật lại chúng cũng không làm chúng chạy.

PM gặp đúng tình huống này khi thử ở local (24/10). Cách xử lý tạm thời: bảng không cho bật / tắt đối tượng bị dừng do cấp trên, mà hiện ghi chú "Bật chiến dịch trước (Ads Manager)". Muốn làm trọn luồng ngay trong AdxLens thì cần thêm hành động ghi ở cấp chiến dịch.

## Quyết định (đề xuất)
- **Loại hành động mới:** thêm `action_type` `pause_campaign` và `resume_campaign`, với `target_type = 'campaign'`.
- **Cách gọi Meta:** giống ADR-0009.
  - Gọi `POST /{campaign_id}` với `status=PAUSED` hoặc `status=ACTIVE`.
  - `before_state = { status, effective_status }`, đọc ngay trước khi ghi.
  - Verify bằng cách đọc lại `status`.
  - Hoàn tác được, bằng cách đặt lại `status` cũ.
  - Nếu đối tượng đã ở trạng thái đích thì không gọi Meta.
- **Chỉ ở `tier=approve`, cho cả hai hành động:**
  - Rule tự động (P2b) không được tạo `pause_campaign` hay `resume_campaign`, vì tạm dừng cả chiến dịch ảnh hưởng rộng hơn nhiều so với một ad set.
  - `resume_campaign` tuân theo PRD 11.2.6 như `resume_*` (không bao giờ tự bật lại).
- **Guardrails:** dùng nguyên bộ hiện có, không nới.
  - Giới hạn số hành động / tài khoản / ngày.
  - Giờ yên tĩnh.
  - Thời gian nghỉ theo đối tượng: `targetIds = [campaign_id]`. Hành động trên ad set hoặc ad con vẫn tính cooldown theo chiến dịch như hiện nay.
  - Ngưỡng dữ liệu tối thiểu: đếm ngày có hiển thị theo `campaign_id` trong `analytics.insights_daily`.
- **Hộp thoại xem trước cho chiến dịch** hiển thị thêm:
  - số ad set đang chạy bên dưới;
  - chi tiêu 7 ngày của chiến dịch (số đã tính sẵn, không do LLM tạo).
- **Phạm vi bên ngoài AdxLens:** cờ vẫn là `p2a_approve`, và tài khoản vẫn cần quyền ghi `ads_management` như ADR-0009.
- **Giao diện:**
  - Bảng chiến dịch có nút Tạm dừng / Bật lại từng dòng và hàng loạt, tối đa 20.
  - Đối tượng con bị dừng do cấp trên hiển thị ghi chú kèm link tới chiến dịch, thay cho chữ "Ads Manager".
- **Ngoài phạm vi:** không đổi ngân sách chiến dịch (CBO) trong ADR này. Việc đó cần ADR riêng, vì giới hạn ±% và cách verify khác.

## Rủi ro
- Tạm dừng nhầm cả chiến dịch làm dừng mọi ad set bên dưới.
  - Giảm thiểu: chỉ có ở `approve`, hộp thoại hiện số ad set bị ảnh hưởng, hoàn tác được, có kill switch.
- Bật lại chiến dịch mà ad set con đang tắt thủ công: Meta giữ nguyên trạng thái từng ad set, nên AdxLens không đụng vào chúng.
  - Hộp thoại ghi rõ "chỉ bật chiến dịch, không bật nhóm QC đang tắt".

## Test bắt buộc khi làm
- Có trong `gateway.test.ts`:
  - pause / resume chiến dịch: verify, rồi hoàn tác;
  - đối tượng đã ở trạng thái đích thì không gọi Meta;
  - cờ tắt → 404;
  - rule P2b tạo `*_campaign` → bị từ chối.
- Có trong test guardrails: cooldown theo chiến dịch; không đủ ngày dữ liệu → vi phạm.
- Bộ cách ly: các route không thay đổi; payload chứa tài khoản của workspace khác → 404.
- Coverage `execution` ≥ 90%. **PM chạy `pnpm execution:check` trên staging** trước khi merge `main`.
