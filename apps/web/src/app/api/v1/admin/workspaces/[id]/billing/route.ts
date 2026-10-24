import { z } from 'zod';
import { PLAN_KEYS } from '@adxlens/core/billing';
import { compPlan, extendGrace } from '@adxlens/core/ops';
import { staffActor } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/** Superadmin: đặt gói thủ công (không qua cổng thanh toán) hoặc gia hạn ân hạn 1–14 ngày. Có lý do + nhật ký. */
export const POST = route({
  auth: 'staff',
  body: z.discriminatedUnion('action', [
    z.object({ action: z.literal('comp'), plan: z.enum(PLAN_KEYS), reason: z.string().trim().min(5).max(500) }),
    z.object({
      action: z.literal('extend_grace'),
      days: z.number().int().min(1).max(14),
      reason: z.string().trim().min(5).max(500),
    }),
  ]),
  handler: async (ctx, { body }) => {
    const workspaceId = uuidParam(ctx, 'id');
    if (body.action === 'comp') {
      await compPlan(ctx.db, staffActor(ctx), { workspaceId, planKey: body.plan, reason: body.reason });
    } else {
      await extendGrace(ctx.db, staffActor(ctx), { workspaceId, days: body.days, reason: body.reason });
    }
    return null;
  },
});
