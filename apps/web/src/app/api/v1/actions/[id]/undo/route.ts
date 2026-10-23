import { undoAction } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** P2-06 Hoàn tác: tạo hành động ngược qua đúng Execution Gateway (quyền duyệt, kill switch, guardrails). */
export const POST = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const a = await undoAction(ctx, uuidParam(ctx, 'id'), { enqueue: ctx.enqueue });
    return Response.json({ action_id: a.id, status: a.status }, { status: 202 });
  },
});
