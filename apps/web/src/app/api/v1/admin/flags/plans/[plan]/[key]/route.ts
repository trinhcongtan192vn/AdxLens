import { z } from 'zod';
import { PLAN_KEYS } from '@adxlens/core/billing';
import { setPlanFlag } from '@adxlens/core/flags';
import { AppError } from '@adxlens/core/shared';
import { flagKeyParam } from '@/server/admin-flags';
import { route } from '@/server/route';

/** ADR-0024: gói có / không có tính năng (superadmin, kiểm trong core/flags). */
export const POST = route({
  auth: 'staff',
  body: z.object({ enabled: z.boolean(), reason: z.string().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    const plan = z.enum(PLAN_KEYS).safeParse(ctx.params.plan);
    if (!plan.success) throw new AppError('NOT_FOUND', 'Không tìm thấy');
    await setPlanFlag(ctx.db, {
      plan: plan.data,
      key: flagKeyParam(ctx.params),
      enabled: body.enabled,
      staffUserId: ctx.user.id,
      reason: body.reason,
    });
    return { ok: true };
  },
});
