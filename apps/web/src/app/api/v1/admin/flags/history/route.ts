import { flagScopeHistory } from '@adxlens/core/flags';
import { route } from '@/server/route';

/** ADR-0024: nhật ký đổi cờ toàn app / theo gói. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => ({
    items: (await flagScopeHistory(ctx.db, 50)).map((h) => ({
      scope: h.scope,
      plan: h.planKey,
      flag: h.flagKey,
      old_value: h.oldValue,
      new_value: h.newValue,
      reason: h.reason,
      at: h.at.toISOString(),
    })),
  }),
});
