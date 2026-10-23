import { z } from 'zod';
import { setCancelAtPeriodEnd } from '@adxlens/core/billing';
import { route } from '@/server/route';
import { stripe } from '@/server/stripe';

/** ST03 "Hủy gói" (cuối kỳ) / "Tiếp tục gói" — Stripe hoặc PayOS. */
export const POST = route({
  auth: 'workspace',
  permission: 'billing.manage',
  body: z.object({ cancel: z.boolean() }),
  handler: async (ctx, { body }) => {
    await setCancelAtPeriodEnd(ctx, body.cancel, { stripe });
    return null;
  },
});
