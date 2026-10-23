import { runAudit } from '@adxlens/core/insight';
import type { HandlerMap } from '../handler';

export const auditHandlers: HandlerMap = {
  // Sau đối chiếu ổn (L3 7.3): chạy bộ quy tắc trên ảnh chụp mới nhất.
  'audit:run': async (p, { db, log }) =>
    runAudit({ db, workspaceId: p.workspaceId }, p.adAccountId, {
      onRuleError: (ruleId, e) => log.error({ rule_id: ruleId, err: e }, 'quy tắc audit lỗi'),
    }),
};
