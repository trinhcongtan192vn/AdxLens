import { automationEffectiveness } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** P215 Hiệu quả tự động hóa 30 ngày (P2-14). Sau cờ `p2b_auto`. */
export const GET = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  handler: async (ctx) => ({
    items: (await automationEffectiveness(ctx)).map((r) => ({
      rule_id: r.ruleId,
      name: r.name,
      mode: r.mode,
      account_name: r.accountName,
      total: r.total,
      success: r.success,
      failed: r.failed,
      undone: r.undone,
      undo_rate: r.undoRate,
      paused_spend_7d: r.pausedSpend7d,
    })),
  }),
});
