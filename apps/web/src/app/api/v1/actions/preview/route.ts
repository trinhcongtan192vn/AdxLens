import { previewAction } from '@adxlens/core/execution';
import { manualActionSchema, toActionRequest } from '@/server/manual-action';
import { route } from '@/server/route';

/** G4: xem trước một hành động từ bảng chiến dịch (trước → sau, vi phạm guardrails). Không gọi Meta. Sau cờ `p2a_approve`. */
export const POST = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  body: manualActionSchema,
  handler: async (ctx, { body }) => {
    const p = await previewAction(ctx, toActionRequest(body));
    return {
      target_name: p.targetName,
      target_type: p.targetType,
      currency: p.account.currency,
      before: p.before,
      after: p.after,
      violations: p.violations,
      undoable: p.undoable,
    };
  },
});
