import { executeAction, runActionPlan } from '@adxlens/core/execution';
import type { HandlerMap } from '../handler';

export const executeHandlers: HandlerMap = {
  // Execution Gateway (L3 7.4, ADR-0008). Gateway tự kiểm cờ `p2a_approve`, kill switch, breaker, quyền ghi,
  // guardrails ngay khi bắt đầu; không tự retry ghi (job lỗi không lặp lại lời gọi ghi đã giành quyền chạy).
  'execute:action': async (p, { db, metaWriter, tokenKeys, enqueue, log, readCreativeImage }) => {
    const r = await executeAction({ db, workspaceId: p.workspaceId }, p.actionId, {
      writer: metaWriter,
      keys: tokenKeys,
      enqueue,
      readCreativeImage,
    });
    log.info({ action_id: p.actionId, ...r }, 'execute:action');
    return r;
  },
  // ADR-0031: kế hoạch đã duyệt — từng bước tuần tự, mỗi bước là một hành động qua Execution Gateway (kiểm cờ, kill
  // switch, guardrails trong từng bước). Không tự retry: bước đã giành quyền chạy không lặp lại.
  'execute:plan': async (p, { db, metaWriter, tokenKeys, enqueue, log, readCreativeImage }) => {
    const r = await runActionPlan({ db, workspaceId: p.workspaceId }, p.planId, {
      writer: metaWriter,
      keys: tokenKeys,
      enqueue,
      readCreativeImage,
    });
    log.info({ plan_id: p.planId, ...r }, 'execute:plan');
    return r;
  },
};
