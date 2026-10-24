import { openStripePortal } from '@adxlens/core/billing';
import { route } from '@/server/route';
import { stripe } from '@/server/stripe';
import { appBaseUrl } from '@/server/public-base';

/** ST03 "Quản lý thanh toán": cổng tự phục vụ Stripe (thẻ, hóa đơn). */
export const POST = route({
  auth: 'workspace',
  permission: 'billing.manage',
  handler: async (ctx) => openStripePortal(ctx, { stripe: stripe(), appUrl: appBaseUrl(ctx.req) }),
});
