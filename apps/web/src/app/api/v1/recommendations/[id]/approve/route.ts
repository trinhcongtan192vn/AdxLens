import { approveRecommendation } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** L3 10.2 `POST /recommendations/{id}/approve` — duyệt 1 click qua Execution Gateway (202). Sau cờ `p2a_approve`. */
export const POST = route({
  auth: 'workspace',
  permission: 'recommendations.update',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const a = await approveRecommendation(ctx, uuidParam(ctx, 'id'), { enqueue: ctx.enqueue });
    return Response.json(
      { action_id: a.id, status: a.status, before: a.beforeState, after_expected: a.afterExpected },
      { status: 202 },
    );
  },
});
