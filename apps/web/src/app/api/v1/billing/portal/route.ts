import { getEnv } from '@adxlens/config/env';
import { openStripePortal } from '@adxlens/core/billing';
import { route } from '@/server/route';
import { stripe } from '@/server/stripe';

/** ST03 "Quản lý thanh toán": cổng tự phục vụ Stripe (thẻ, hóa đơn). */
export const POST = route({
  auth: 'workspace',
  permission: 'billing.manage',
  handler: async (ctx) => openStripePortal(ctx, { stripe: stripe(), appUrl: getEnv().APP_URL }),
});
