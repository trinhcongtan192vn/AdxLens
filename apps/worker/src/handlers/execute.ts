import { executeAction } from '@adxlens/core/execution';
import type { HandlerMap } from '../handler';

export const executeHandlers: HandlerMap = {
  // Execution Gateway (L3 7.4, ADR-0008). Gateway tự kiểm cờ `p2a_approve`, kill switch, breaker, quyền ghi,
  // guardrails ngay khi bắt đầu; không tự retry ghi (job lỗi không lặp lại lời gọi ghi đã giành quyền chạy).
  'execute:action': async (p, { db, metaWriter, tokenKeys, enqueue, log }) => {
    const r = await executeAction({ db, workspaceId: p.workspaceId }, p.actionId, {
      writer: metaWriter,
      keys: tokenKeys,
      enqueue,
    });
    log.info({ action_id: p.actionId, ...r }, 'execute:action');
    return r;
  },
};
