import { runChecklist } from '@adxlens/core/flags';
import { flagKeyParam } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/** AD02: chạy checklist kỹ thuật của cờ cho workspace (L3 18.3). */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => ({
    items: await runChecklist(ctx.db, uuidParam(ctx, 'id'), flagKeyParam(ctx.params)),
  }),
});
