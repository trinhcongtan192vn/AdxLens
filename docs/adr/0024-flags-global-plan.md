# ADR-0024: Cờ tính năng toàn app × gói + ngoại lệ theo workspace; quyền ghi theo kết nối

- Trạng thái: **Chấp nhận** (PM, 25/10/2026: "đã qua giai đoạn thử nghiệm")
- Thay một phần: L3 18.1–18.2 (cờ theo workspace, staff bật từng workspace qua checklist), ADR-0008 bước "Owner bật
  quyền ghi"
- Vùng bảo vệ:
  - `packages/core/flags`, `packages/db` (bảng `flag_global`, `plan_flags`, `flag_scope_log`; migration 0077–0078);
  - `packages/core/connections` (mặc định quyền ghi);
  - `packages/core/execution` (bỏ kiểm gói riêng).

## Quyết định

**1. Cờ có hiệu lực cho một workspace:**
- Nếu workspace có **ngoại lệ** (`feature_flags`), dùng ngoại lệ: `true` = bật thêm, `false` = tắt riêng.
- Nếu không có ngoại lệ: **cờ toàn app** (`flag_global`) **VÀ gói của workspace có tính năng** (`plan_flags`).
- Thứ tự cha → con vẫn áp dụng: P0 → P1 → P2a → P2b. Cờ con chỉ có hiệu lực khi cờ cha có hiệu lực.
- Mọi kiểm tra cờ ở API, job, trang (quy tắc 7) dùng giá trị này qua `isEnabled` / `getFlags`. Không có đường đổi cờ
  nào ngoài `core/flags`.

**2. Ma trận gói:**
- Lưu DB, superadmin sửa ở `/admin/flags`.
- Không có dòng thì theo mặc định trong code (`DEFAULT_PLAN_FLAGS`): Free = P0; Starter = P0 + P1; Growth / Scale =
  tất cả.
- Gói giờ nằm trong cờ hiệu lực. Execution Gateway và rule không còn kiểm `write_actions` riêng, nên ngoại lệ "bật
  thêm" (dùng thử, demo) hoạt động trọn vẹn.

**3. Quyền đổi:**
- Toàn app, theo gói: chỉ superadmin, bắt buộc lý do, ghi `flag_scope_log` (chỉ thêm).
- Ngoại lệ:
  - **bật thêm**: superadmin (operator gửi đề xuất, ADR-0013);
  - **tắt riêng** và **bỏ ngoại lệ**: mọi staff;
  - mỗi thay đổi ghi `flag_change_log`.
- Checklist kỹ thuật vẫn chạy và ghi nhật ký nhưng **không chặn** nữa.

**4. Chuyển đổi dữ liệu:**
- Cờ toàn app khởi tạo **tắt**: không tự bật cờ, quy tắc 7. PM bật ở admin.
- Dòng `feature_flags` đang bật (từ giai đoạn thử nghiệm) giữ làm "bật thêm" để không ai mất tính năng.
- Dòng đang tắt bị xóa, để workspace đó theo toàn app × gói.

**5. Quyền ghi Meta:**
- Kết nối có `ads_management` nghĩa là agency đồng ý cho AdxLens thao tác tài khoản. `write_enabled` bật ngay lúc kết
  nối, không còn bước "Cấp quyền ghi".
- Owner vẫn **tắt** được ở Kết nối → Quyền ghi. Kết nối lại không ghi đè lựa chọn đã tắt của Owner.
- Migration bật cho kết nối hiện có chưa từng bị Owner chỉnh.
- Guardrails, kill switch, breaker, duyệt từng hành động: **không đổi**.

## Hệ quả

- Đổi toàn app / gói có hiệu lực sau tối đa 60 giây (cache cờ theo workspace).
- Tắt cờ toàn app không chạy handler cho từng workspace. Hành động ghi đang chờ bị hủy khi worker chạy, vì executor
  kiểm lại cờ.
- Bảng giá (`billing/plans.ts`) vẫn mô tả quyền lợi để hiển thị. Nguồn quyết định tính năng chạy được là ma trận trong
  DB.
