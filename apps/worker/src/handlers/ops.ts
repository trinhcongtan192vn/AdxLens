import { runHealthChecks } from '@adxlens/core/ops';
import type { HandlerMap } from '../handler';

export const opsHandlers: HandlerMap = {
  // Chạy cho toàn hệ thống, không phụ thuộc cờ (L3 7.1 queue `ops`).
  'ops:health_check': async (_payload, { db, log }) => {
    const results = await runHealthChecks(db);
    const failed = Object.entries(results)
      .filter(([, r]) => !r.ok)
      .map(([name]) => name);
    if (failed.length) log.warn({ failed }, 'health check thất bại');
    return results;
  },
};
