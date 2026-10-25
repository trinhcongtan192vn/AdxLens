# ADR-0006: Vòng đời phát hiện (finding) — một dòng cho mỗi (quy tắc, đối tượng)

- Trạng thái: Đã chấp nhận (Claude Code theo ủy quyền ADR-0001; PM review cuối)
- Ngày: 23/10/2026

## Bối cảnh
L3 5.2 phác thảo `app.findings` với khóa duy nhất `(ad_account_id, rule_id, entity_type, meta_id, snapshot_version)`: mỗi lần audit trên snapshot mới sinh dòng mới. Hệ quả: phản hồi của người dùng (đã xem, đã làm, bỏ qua) nằm ở dòng cũ và mất khi snapshot đổi (mỗi ngày); danh sách D02 phải tự gom theo snapshot mới nhất; không biết vấn đề đã hết.

## Quyết định
- Khóa duy nhất `(ad_account_id, rule_id, entity_type, meta_id)`; cột `snapshot_version` ghi snapshot lần phát hiện gần nhất, `first_seen_at`/`last_seen_at` giữ lịch sử.
- Thêm trạng thái `resolved`: lần audit mới không còn phát hiện → `resolved` (tự động). Phát hiện lại:
  - đang `new`/`seen` → giữ nguyên, cập nhật bằng chứng;
  - `done` hoặc `resolved` → mở lại `new` (vấn đề quay lại);
  - `dismissed` → giữ `dismissed` (người dùng đã chọn bỏ qua).
- Văn bản giải thích lưu dạng khóa i18n + tham số (`rules.<rule_id>.why`), dịch khi trả API/hiển thị; số liệu trong tham số đã tính sẵn (quy tắc 5: không có LLM ở đây).
- Health score chỉ tính phát hiện `new`/`seen`.

## Hệ quả
- Phản hồi người dùng bền qua các lần đồng bộ; D02 đọc trực tiếp không cần gom.
- `finding_feedback` vẫn ghi mọi thao tác (kể cả `wrong`) để tổng hợp tỷ lệ sai theo quy tắc (L2 5.4).
