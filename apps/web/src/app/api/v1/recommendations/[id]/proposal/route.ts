import { proposalForRecommendation } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** P202 nội dung hộp thoại duyệt (trước / sau, guardrails, cảnh báo). Sau cờ `p2a_approve`. */
export const GET = route({
  auth: 'workspace',
  permission: 'recommendations.update',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const p = await proposalForRecommendation(ctx, uuidParam(ctx, 'id'));
    if (!p.executable) return { executable: false };
    return {
      executable: true,
      action_type: p.actionType,
      target: { type: p.target.type, meta_id: p.target.metaId, name: p.target.name },
      account_name: p.accountName,
      currency: p.currency,
      before: p.before,
      after: p.after,
      violations: p.violations,
      undoable: p.undoable,
      warnings: p.warnings,
      can_approve: p.canApprove,
    };
  },
});
