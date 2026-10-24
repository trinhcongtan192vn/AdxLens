import { z } from 'zod';
import { PAID_PLANS, startPayosCheckout, startStripeCheckout } from '@adxlens/core/billing';
import { payos } from '@/server/payos';
import { route } from '@/server/route';
import { stripe } from '@/server/stripe';
import { appBaseUrl } from '@/server/public-base';

/** ST03 "Chọn gói": thẻ quốc tế (Stripe Checkout) hoặc QR / chuyển khoản VND (PayOS). Trả URL để chuyển hướng. */
export const POST = route({
  auth: 'workspace',
  permission: 'billing.manage',
  body: z.object({
    plan: z.enum(PAID_PLANS),
    period: z.enum(['monthly', 'annual']),
    method: z.enum(['stripe', 'payos']).default('stripe'),
  }),
  handler: async (ctx, { body }) => {
    const appUrl = appBaseUrl(ctx.req);
    if (body.method === 'payos') {
      const r = await startPayosCheckout(ctx, body, { payos: payos(), appUrl });
      return { url: r.url };
    }
    return startStripeCheckout(ctx, { ...body, email: ctx.user.email }, { stripe: stripe(), appUrl });
  },
});
