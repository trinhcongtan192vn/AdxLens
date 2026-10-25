import { z } from 'zod';
import { clearFlagOverride, disableFlag, enableFlag } from '@adxlens/core/flags';
import { flagKeyParam } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/**
 * AD02 — ngoại lệ theo workspace (ADR-0024): `enabled: true` = bật thêm (superadmin), `false` = tắt riêng (mọi staff,
 * tắt luôn cờ phụ thuộc). Checklist chỉ ghi nhật ký, không chặn. Đường đổi cờ duy nhất là `core/flags` (quy tắc 7).
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

/** Bỏ ngoại lệ → workspace về theo toàn app × gói (mọi staff, bắt buộc lý do). */
export const DELETE = route({
  auth: 'staff',
  body: z.object({ reason: z.string().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    await clearFlagOverride(ctx.db, {
      workspaceId: uuidParam(ctx, 'id'),
      key: flagKeyParam(ctx.params),
      staffUserId: ctx.user.id,
      reason: body.reason,
    });
    return null;
  },
});
