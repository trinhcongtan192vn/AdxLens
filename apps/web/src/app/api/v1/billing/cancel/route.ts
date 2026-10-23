import { z } from 'zod';
import { setStripeCancel } from '@adxlens/core/billing';
import { route } from '@/server/route';
import { stripe } from '@/server/stripe';

/** ST03 "Hủy gói" (cuối kỳ) / "Tiếp tục gói". */
export const POST = route({
  auth: 'workspace',
  permission: 'billing.manage',
  body: z.object({ cancel: z.boolean() }),
  handler: async (ctx, { body }) => {
    await setStripeCancel(ctx, body.cancel, { stripe: stripe() });
    return null;
  },
});
