import { adminPlans, billingOverview } from '@adxlens/core/ops';
import { route } from '@/server/route';

/** Thanh toán (staff): gói hiện hành, workspace quá hạn / vượt hạn mức, đơn PayOS và sự kiện webhook gần đây. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => {
    const [plans, o] = await Promise.all([adminPlans(ctx.db), billingOverview(ctx.db)]);
    return {
      plans: plans.map((p) => ({
        key: p.key,
        monthly_price_vnd: String(p.monthlyPriceVnd),
        monthly_price_usd: p.monthlyPriceUsd === null ? null : String(p.monthlyPriceUsd),
        included_accounts: p.includedAccounts,
        extra_account_vnd: String(p.extraAccountVnd),
        entitlements: p.entitlements,
        from_db: p.fromDb,
      })),
      attention: o.attention,
      orders: o.orders,
      events: o.events,
    };
  },
});
