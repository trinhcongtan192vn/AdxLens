import { z } from 'zod';
import { adminResync } from '@adxlens/core/ops';
import { staffActor } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/** Staff chạy lại đồng bộ một tài khoản QC (1–90 ngày gần nhất), có lý do và nhật ký admin. */
export const POST = route({
  auth: 'staff',
  body: z.object({ days: z.number().int().min(1).max(90), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    const r = await adminResync(
      ctx.db,
      staffActor(ctx),
      { adAccountId: uuidParam(ctx, 'id'), ...body },
      { enqueue: ctx.enqueue },
    );
    return { sync_run_id: r.syncRunId, from: r.from, to: r.to };
  },
});
