import { getEnv } from '@adxlens/config/env';
import { stripeEventSchema, verifyStripeSignature } from '@adxlens/core/billing';
import { handleStripeWebhook } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { route } from '@/server/route';

/**
 * L3 (Stripe → webhook): xác minh `Stripe-Signature` bằng webhook secret trên body thô, rồi xử lý một lần
 * (idempotent theo mã sự kiện). Nội dung sự kiện là dữ liệu, chỉ đọc các trường cần thiết.
 */
export const POST = route({
  auth: 'public',
  handler: async (ctx) => {
    const secret = getEnv().STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new AppError('SERVICE_UNAVAILABLE', 'Chưa cấu hình webhook Stripe');
    const payload = await ctx.req.text();
    if (!verifyStripeSignature(payload, ctx.req.headers.get('stripe-signature'), secret)) {
      throw new AppError('BAD_REQUEST', 'Chữ ký không hợp lệ');
    }
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      throw new AppError('BAD_REQUEST', 'Body không hợp lệ');
    }
    const event = stripeEventSchema.parse(json);
    const r = await handleStripeWebhook(ctx.db, event, { enqueue: ctx.enqueue });
    ctx.log.info({ event_type: event.type, result: r.status, workspace_id: r.workspaceId }, 'stripe webhook');
    return { received: true };
  },
});
