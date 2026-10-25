import { cancelActionPlan } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** ADR-0031: bỏ kế hoạch chưa duyệt. */
export const POST = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const plan = await cancelActionPlan(ctx, uuidParam(ctx, 'id'));
    return { id: plan.id, status: plan.status };
  },
});
