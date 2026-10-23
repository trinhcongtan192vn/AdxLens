import { flagHistory } from '@adxlens/core/flags';
import { route, uuidParam } from '@/server/route';

/** AD02: lịch sử đổi cờ (append-only). */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => ({
    items: (await flagHistory(ctx.db, uuidParam(ctx, 'id'))).map((h) => ({
      flag: h.flagKey,
      old_value: h.oldValue,
      new_value: h.newValue,
      reason: h.reason,
      override: h.override,
      checklist: h.checklistResult,
      changed_by: h.changedBy,
      at: h.at.toISOString(),
    })),
  }),
});
