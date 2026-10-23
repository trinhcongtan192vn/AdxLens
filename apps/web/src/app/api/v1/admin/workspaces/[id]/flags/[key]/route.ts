import { z } from 'zod';
import { disableFlag, enableFlag } from '@adxlens/core/flags';
import { flagKeyParam } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/**
 * AD02 bật/tắt cờ: bắt buộc lý do; bật chỉ PM (`can_enable_flags`), vượt checklist được ghi log; tắt mọi
 * staff, tắt luôn cờ phụ thuộc. Đường bật cờ duy nhất là `core/flags` (CLAUDE.md quy tắc 7).
 */
export const POST = route({
  auth: 'staff',
  body: z.object({ enabled: z.boolean(), reason: z.string().min(5).max(500), override: z.boolean().optional() }),
  handler: async (ctx, { body }) => {
    const workspaceId = uuidParam(ctx, 'id');
    const key = flagKeyParam(ctx.params);
    if (body.enabled) {
      const r = await enableFlag(ctx.db, {
        workspaceId,
        key,
        staffUserId: ctx.user.id,
        reason: body.reason,
        override: body.override,
      });
      return { enabled: true, override: r.override, checklist: r.checklist };
    }
    const off = await disableFlag(ctx.db, { workspaceId, key, staffUserId: ctx.user.id, reason: body.reason });
    return { enabled: false, turned_off: off };
  },
});
