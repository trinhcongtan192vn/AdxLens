import { runAnomalyCheck, runAudit } from '@adxlens/core/insight';
import type { HandlerMap } from '../handler';

export const auditHandlers: HandlerMap = {
  // Sau đối chiếu ổn (L3 7.3): chạy bộ quy tắc trên ảnh chụp mới nhất, rồi kiểm bất thường hôm qua (A5).
  'audit:run': async (p, { db, log, enqueue }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    const audit = await runAudit(ctx, p.adAccountId, {
      onRuleError: (ruleId, e) => log.error({ rule_id: ruleId, err: e }, 'quy tắc audit lỗi'),
    });
    const anomalies = await runAnomalyCheck(ctx, p.adAccountId, { enqueue });
    if (anomalies.anomalies.length) log.info({ anomalies: anomalies.anomalies.map((a) => a.kind) }, 'bất thường');
    return { ...audit, anomalies: anomalies.anomalies.length };
  },
};
