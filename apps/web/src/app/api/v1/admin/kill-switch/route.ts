import { z } from 'zod';
import { getGlobalKillSwitch, setGlobalKillSwitchByStaff } from '@adxlens/core/ops';
import { staffActor } from '@/server/admin-flags';
import { route } from '@/server/route';

/** AD04 Kill switch toàn cục (ADR-0013): staff xem; mọi staff BẬT được (dừng khẩn cấp), chỉ superadmin tắt. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => getGlobalKillSwitch(ctx.db),
});

export const POST = route({
  auth: 'staff',
  body: z.object({ active: z.boolean(), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    const r = await setGlobalKillSwitchByStaff(ctx.db, staffActor(ctx), body);
    ctx.log.warn({ active: body.active, canceled: r.canceled }, 'kill switch toàn cục');
    return r;
  },
});
