import { z } from 'zod';
import { getGlobalKillSwitch, setGlobalKillSwitch } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { route } from '@/server/route';

/** AD04 Kill switch toàn cục (staff xem; chỉ PM bật/tắt). */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => getGlobalKillSwitch(ctx.db),
});

export const POST = route({
  auth: 'staff',
  body: z.object({ active: z.boolean(), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    if (!ctx.staff.canEnableFlags) throw new AppError('FORBIDDEN', 'Chỉ PM');
    const r = await setGlobalKillSwitch(ctx.db, { ...body, changedBy: ctx.user.id });
    ctx.log.warn({ active: body.active, canceled: r.canceled }, 'kill switch toàn cục');
    return r;
  },
});
