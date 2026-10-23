import { z } from 'zod';
import { approveRecommendations, BULK_APPROVE_LIMIT } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** B2: duyệt hàng loạt gợi ý (tối đa 20) qua Execution Gateway; kết quả từng gợi ý. Sau cờ `p2a_approve`. */
export const POST = route({
  auth: 'workspace',
  permission: 'recommendations.update',
  flag: 'p2a_approve',
  body: z.object({ ids: z.array(z.string().uuid()).min(1).max(BULK_APPROVE_LIMIT) }),
  handler: async (ctx, { body }) => {
    const results = await approveRecommendations(ctx, body.ids, { enqueue: ctx.enqueue });
    return Response.json(
      {
        approved: results.filter((r) => r.ok).length,
        items: results.map((r) =>
          r.ok
            ? { id: r.id, ok: true, action_id: r.actionId }
            : { id: r.id, ok: false, code: r.code, message: r.message },
        ),
      },
      { status: 202 },
    );
  },
});
