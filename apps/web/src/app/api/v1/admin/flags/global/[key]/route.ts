import { z } from 'zod';
import { setGlobalFlag } from '@adxlens/core/flags';
import { flagKeyParam } from '@/server/admin-flags';
import { route } from '@/server/route';

/** ADR-0024: bật / tắt cờ TOÀN APP (superadmin, kiểm trong core/flags). Tắt cờ cha tắt luôn cờ con. */
export const POST = route({
  auth: 'staff',
  body: z.object({ enabled: z.boolean(), reason: z.string().min(5).max(500) }),
  handler: async (ctx, { body }) => ({
    changed: await setGlobalFlag(ctx.db, {
      key: flagKeyParam(ctx.params),
      enabled: body.enabled,
      staffUserId: ctx.user.id,
      reason: body.reason,
    }),
  }),
});
