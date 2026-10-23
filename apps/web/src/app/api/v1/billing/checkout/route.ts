import { z } from 'zod';
import { getEnv } from '@adxlens/config/env';
import { PAID_PLANS, startStripeCheckout } from '@adxlens/core/billing';
import { route } from '@/server/route';
import { stripe } from '@/server/stripe';

/** ST03 "Nâng gói": tạo phiên Stripe Checkout, trả URL để chuyển hướng. */
export const POST = route({
  auth: 'workspace',
  permission: 'billing.manage',
  body: z.object({ plan: z.enum(PAID_PLANS), period: z.enum(['monthly', 'annual']) }),
  handler: async (ctx, { body }) =>
    startStripeCheckout(ctx, { ...body, email: ctx.user.email }, { stripe: stripe(), appUrl: getEnv().APP_URL }),
});
