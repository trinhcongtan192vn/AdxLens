import { approveActionPlan } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/**
 * ADR-0031: duyệt một lần — kiểm mọi bước (quyền duyệt theo Client, guardrails, kill switch) rồi xếp job chạy tuần tự.
 * Vi phạm → 422 kèm kết quả kiểm từng bước. Agent không bao giờ gọi route này.
 */
export const POST = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const { plan, checks } = await approveActionPlan(ctx, uuidParam(ctx, 'id'), { enqueue: ctx.enqueue });
    return Response.json({ id: plan.id, status: plan.status, checks }, { status: 202 });
  },
});
