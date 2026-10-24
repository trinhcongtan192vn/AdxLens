import { estimateRuleSavings, ruleInputSchema } from '@adxlens/core/execution';
import { route } from '@/server/route';

/**
 * P213 backtest 30 ngày trên snapshot (không gọi Meta) trước khi lưu rule, kèm ước tính chi tiêu tránh được / chi thêm
 * (Madgicx "You could have saved…"). Số do code tính.
 */
export const POST = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  body: ruleInputSchema,
  handler: async (ctx, { body }) => estimateRuleSavings(ctx, body),
});
