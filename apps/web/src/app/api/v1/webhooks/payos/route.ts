import { getEnv } from '@adxlens/config/env';
import { payosWebhookSchema, verifyPayosWebhook } from '@adxlens/core/billing';
import { handlePayosWebhook } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { route } from '@/server/route';

/**
 * Webhook PayOS (028): xác minh chữ ký trên `data` bằng checksum key, rồi ghi nhận đơn đã trả (khớp số
 * tiền, idempotent). Nội dung là dữ liệu, chỉ đọc các trường cần.
 */
export const POST = route({
  auth: 'public',
  handler: async (ctx) => {
    const key = getEnv().PAYOS_CHECKSUM_KEY;
    if (!key) throw new AppError('SERVICE_UNAVAILABLE', 'Chưa cấu hình PayOS');
    const parsed = payosWebhookSchema.safeParse(await ctx.req.json().catch(() => null));
    if (!parsed.success) throw new AppError('BAD_REQUEST', 'Body không hợp lệ');
    if (!verifyPayosWebhook(parsed.data, key)) throw new AppError('BAD_REQUEST', 'Chữ ký không hợp lệ');
    const r = await handlePayosWebhook(ctx.db, parsed.data);
    ctx.log.info({ result: r.status, workspace_id: r.workspaceId }, 'payos webhook');
    if (r.status === 'amount_mismatch') ctx.log.warn({ workspace_id: r.workspaceId }, 'payos: số tiền không khớp đơn');
    return { success: true };
  },
});
