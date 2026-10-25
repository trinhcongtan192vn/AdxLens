import { liveEvaluate, runScheduledRevert, shadowEvaluate } from '@adxlens/core/execution';
import { isEnabled } from '@adxlens/core/flags';
import { activeAutomationRules, dueReverts } from '@adxlens/core/ops';
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

  // ADR-0021: mỗi 15 phút, lịch hẹn đến hạn → `execute:revert` (job tự kiểm cờ, gateway kiểm lại đủ cổng).
  'maintenance:reverts_tick': async (_p, { db, enqueue }) => {
    const tick = new Date(Math.floor(Date.now() / 900_000) * 900_000).toISOString();
    const due = await dueReverts(db, new Date());
    for (const r of due) await enqueue('execute:revert', { workspaceId: r.workspaceId, revertId: r.id, tick });
    return { enqueued: due.length };
  },

  'execute:revert': async (p, { db, enqueue, log }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p2b_auto'))) return { status: 'flag_off' };
    const r = await runScheduledRevert(ctx, p.revertId, { enqueue });
    log.info({ revert_id: p.revertId, ...r }, 'execute:revert');
    return r;
  },

  // Shadow mode (P2-13): ghi `would_do`, không tạo hành động. Kiểm cờ ở đầu job (CLAUDE.md quy tắc 7).
  'rules:shadow_evaluate': async (p, { db }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p2b_auto'))) return { status: 'flag_off' };
    return shadowEvaluate(ctx, p.ruleId);
  },

  // Rule live (P2b): tạo hành động tier auto qua Execution Gateway. Kiểm cờ ở đầu job; gateway kiểm lại đủ cổng.
  'rules:evaluate': async (p, { db, enqueue, log }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p2b_auto'))) return { status: 'flag_off' };
    const r = await liveEvaluate(ctx, p.ruleId, { enqueue });
    log.info({ rule_id: p.ruleId, ...r }, 'rules:evaluate');
    return r;
  },
};
