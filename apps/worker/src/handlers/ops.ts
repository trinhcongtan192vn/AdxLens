import { purgeConnectionData } from '@adxlens/core/connections';
import { remediateHealth, runHealthChecks, runPayosRenewals, runTokenExpiringPlaybook } from '@adxlens/core/ops';
import type { HandlerMap } from '../handler';

export const opsHandlers: HandlerMap = {
  // Chạy cho toàn hệ thống, không phụ thuộc cờ (L3 7.1 queue `ops`).
  'ops:health_check': async (_payload, { db, log, throttleQueue }) => {
    const results = await runHealthChecks(db);
    const failed = Object.entries(results)
      .filter(([, r]) => !r.ok)
      .map(([name]) => name);
    if (failed.length) log.warn({ failed }, 'health check thất bại');
    // Mức 2 (L2 11.1): playbook tự khắc phục cho tín hiệu có kịch bản.
    const playbooks = await remediateHealth(db, results, { throttleQueue });
    if (Object.keys(playbooks).length) log.info({ playbooks }, 'đã chạy playbook');
    return results;
  },

  // Hằng ngày: playbook token_expiring (L2 11.2).
  'maintenance:daily_tick': async (_payload, { db, email, appUrl, log, enqueue }) => {
    const r = await runTokenExpiringPlaybook(db, { email, appUrl });
    if (r.notified || r.expired) log.info(r, 'token_expiring');
    // Gia hạn PayOS (028): nhắc trước 7 / 1 ngày, hết kỳ → quá hạn hoặc về Free.
    const renewals = await runPayosRenewals(db, { enqueue });
    if (renewals.reminded || renewals.pastDue || renewals.canceled) log.info(renewals, 'payos renewals');
    return { ...r, renewals };
  },

  // Xóa dữ liệu quảng cáo 7 ngày sau khi ngắt kết nối (L3 5.5, P0-22).
  'maintenance:purge_connection_data': async (p, { db, email, appUrl }) =>
    purgeConnectionData({ db, workspaceId: p.workspaceId }, p.connectionId, { email, appUrl }),
};
