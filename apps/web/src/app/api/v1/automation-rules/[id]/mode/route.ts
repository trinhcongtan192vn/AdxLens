import { z } from 'zod';
import { setRuleMode } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** P211/P214: shadow / live / tạm dừng. Live chỉ khi shadow ≥ 14 ngày, cờ bật, gói đủ (ADR-0012). */
export const POST = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  body: z.object({ mode: z.enum(['shadow', 'live', 'paused']) }),
  handler: async (ctx, { body }) => {
    const r = await setRuleMode(ctx, uuidParam(ctx, 'id'), body.mode);
    return { id: r.id, mode: r.mode };
  },
});
