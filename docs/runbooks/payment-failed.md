# Runbook: thanh toán thất bại, quá hạn, webhook không tới

**Khi nào:** banner X04 "Chưa thanh toán kỳ hiện tại", email E05, khách báo đã trả nhưng gói chưa đổi.

## 1. Hệ thống đã làm gì
- Stripe `invoice.payment_failed` / PayOS hết kỳ chưa trả → `past_due`, ân hạn 7 ngày (ADR-0001 A8), thông báo Owner. Hết ân hạn → quyền về Free (dữ liệu giữ nguyên; tài khoản vượt hạn mức Free ngừng đồng bộ).
- Webhook xử lý một lần (`billing_events` unique); PayOS ST04 tự tra trạng thái đơn khi khách quay về.

## 2. Khách đã trả nhưng gói chưa đổi
- Stripe: kiểm tra webhook ở Stripe Dashboard → Developers → Webhooks (sự kiện có tới không, mã trả về). Gửi lại sự kiện từ Dashboard — xử lý trùng an toàn.
- PayOS: kiểm tra đơn trên my.payos.vn; khách mở lại link ST04 (`/settings/billing/checkout?provider=payos&orderCode=…`) để tra lại.
- Số tiền webhook khác đơn → **không ghi nhận** (log `amount_mismatch`): đối chiếu với khách, không sửa DB bằng tay khi chưa rõ.

## 3. Không làm
- Không đổi gói trực tiếp trong DB production; không nới ân hạn ngoài ADR.

## Ở trang admin
- `/admin/billing`: workspace quá hạn / vượt hạn mức, đơn PayOS và sự kiện webhook gần đây.
- Hỗ trợ khách (superadmin, bắt buộc lý do, ghi `/admin/audit`): `/admin/workspaces/<id>` → **Gia hạn ân hạn** 1–14 ngày, hoặc **Đặt gói thủ công** khi khách không thanh toán qua cổng (design partner, chuyển khoản tay).
