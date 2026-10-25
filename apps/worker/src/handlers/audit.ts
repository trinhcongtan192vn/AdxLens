import { runAnomalyCheck, runAudit } from '@adxlens/core/insight';
import { runCustomAlerts } from '@adxlens/core/reporting';
import type { HandlerMap } from '../handler';

export const auditHandlers: HandlerMap = {
  // Sau đối chiếu ổn (L3 7.3): chạy bộ quy tắc trên ảnh chụp mới nhất, rồi kiểm bất thường hôm qua (A5), rồi cảnh báo
  // người dùng tự đặt (ADR-0018).
  'audit:run': async (p, { db, log, enqueue }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    const audit = await runAudit(ctx, p.adAccountId, {
      onRuleError: (ruleId, e) => log.error({ rule_id: ruleId, err: e }, 'quy tắc audit lỗi'),
    });
    const anomalies = await runAnomalyCheck(ctx, p.adAccountId, { enqueue });
    if (anomalies.anomalies.length) log.info({ anomalies: anomalies.anomalies.map((a) => a.kind) }, 'bất thường');
    const alerts = await runCustomAlerts(ctx, p.adAccountId, { enqueue });
    if (alerts.fired) log.info({ fired: alerts.fired }, 'cảnh báo tự đặt');
    return { ...audit, anomalies: anomalies.anomalies.length, customAlerts: alerts.fired };
  },
};
