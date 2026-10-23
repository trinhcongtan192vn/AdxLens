import { shadowEvaluate } from '@adxlens/core/execution';
import { isEnabled } from '@adxlens/core/flags';
import { activeAutomationRules } from '@adxlens/core/ops';
import type { HandlerMap } from '../handler';

export const rulesHandlers: HandlerMap = {
  // Mỗi 30 phút: enqueue đánh giá cho rule shadow / live (job tự kiểm cờ).
  'maintenance:rules_tick': async (_p, { db, enqueue }) => {
    const tick = new Date(Math.floor(Date.now() / 1_800_000) * 1_800_000).toISOString();
    const rules = await activeAutomationRules(db);
    for (const r of rules) {
      const name = r.mode === 'live' ? 'rules:evaluate' : 'rules:shadow_evaluate';
      await enqueue(name, { workspaceId: r.workspaceId, ruleId: r.id, tick });
    }
    return { enqueued: rules.length };
  },

  // Shadow mode (P2-13): ghi `would_do`, không tạo hành động. Kiểm cờ ở đầu job (CLAUDE.md quy tắc 7).
  'rules:shadow_evaluate': async (p, { db }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p2b_auto'))) return { status: 'flag_off' };
    return shadowEvaluate(ctx, p.ruleId);
  },
};
