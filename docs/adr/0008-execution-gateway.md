# ADR-0008: Execution Gateway — đường duy nhất ghi lên Meta (P2a)

- Trạng thái: Đề xuất (Claude Code theo ủy quyền ADR-0001; **PM duyệt bắt buộc** — vùng bảo vệ `packages/core/execution`)
- Ngày: 23/10/2026
- Liên quan: PRD 11, L3 7.4 + 5.2 (`actions`, `action_logs`), L3 18 (cờ `p2a_approve`), ADR-0001 A6/A7, CLAUDE.md quy tắc 3, 6, 7

## Bối cảnh
P2a cho phép duyệt 1 click các hành động ghi trên Meta. Mọi lỗi ở đây gây thiệt hại tiền thật cho khách, nên cần một đường thực thi duy nhất, kiểm tra được và dừng được ngay.

## Quyết định
1. **Một cổng duy nhất** `packages/core/execution` gọi `@adxlens/meta-client/write` (ranh giới đã có trong `check-boundaries`). Web chỉ tạo `actions(status=pending)` rồi enqueue `execute:action`; chỉ worker giải mã token và gọi Meta.
2. **Thứ tự kiểm tra trước khi ghi** (mọi bước đều chặn, không đường tắt):
   1. cờ `p2a_approve` bật cho workspace (và gói có quyền `write_actions` — Growth trở lên, ADR-0001 A6);
   2. kill switch toàn cục và kill switch workspace đều tắt; circuit breaker của tài khoản QC không mở;
   3. kết nối có scope `ads_management` và quyền ghi chưa bị thu hồi trong AdxLens;
   4. vai trò: owner/manager, hoặc buyer được Owner cấp quyền duyệt cho Client của tài khoản (`memberships.approve_client_ids`);
   5. guardrails (ADR-0001 A7, khóa bằng test; workspace chỉ siết chặt hơn): ±15% ngân sách mỗi hành động, ≤ 5 hành động/ngày/tài khoản, ≥ 3 ngày dữ liệu, không tự chạy 22:00–06:00 giờ tài khoản (áp cho `tier=auto`; `tier=approve` do người bấm), danh sách loại trừ;
   6. trạng thái hiện tại trên Meta khớp `before_state` lúc duyệt (đối tượng đã bị đổi bởi người khác → dừng, không ghi đè).
3. **Không tự retry ghi.** HTTP ghi dùng `maxAttempts = 1`. Lỗi giữa chừng → **verifier đọc lại** trạng thái thật: nếu đã đúng `after_expected` thì ghi nhận thành công; nếu vẫn như trước thì `failed`; trạng thái khác → `failed` + cảnh báo. Retry chỉ do người bấm lại (hành động mới).
4. **Idempotency:** `actions.idempotency_key` unique (`recommendation_id:action_type:target:after`), job id BullMQ theo `action_id`; trạng thái chuyển `pending → executing` bằng câu lệnh có điều kiện (chỉ một worker giành được).
5. **Nhật ký append-only** `action_logs` cho mọi bước (requested, checks, before, call, verify, result, undo). Không ghi token, body request hay thông điệp lỗi chưa che.
6. **Circuit breaker:** 3 lỗi liên tiếp trên một tài khoản QC → mở breaker, chặn hành động mới của tài khoản đó tới khi Owner đóng lại; báo sự cố + thông báo.
7. **Kill switch:** workspace (Owner/PM) và toàn cục (staff, có CLI dự phòng). Bật kill switch hủy mọi action `pending`.
8. **Hoàn tác** = một action mới với đích là `before_state` của action gốc (`undo_of`), đi qua đúng các bước trên. Hành động không hoàn tác được (nhân bản) phải cảnh báo trước khi duyệt.
9. **Môi trường:** chỉ `local` (Meta mock) và `staging` (tài khoản Meta test trong danh sách cho phép `META_WRITE_TEST_ACCOUNTS`). Script test tích hợp từ chối chạy với tài khoản ngoài danh sách. Không có quyền production (CLAUDE.md quy tắc 9).

## Hệ quả
- Mỗi loại hành động ghi mới cần ADR riêng (0009–0011) và test cho: thành công, Meta lỗi giữa chừng, verify không khớp, retry trùng, undo.
- PM phải chạy test tích hợp trên staging trước khi merge `develop → main` và trước khi bật `p2a_approve` cho khách (L3 17.2).
- Coverage `packages/core/execution` ≥ 90%.
