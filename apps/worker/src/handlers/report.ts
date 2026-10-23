import { isEnabled } from '@adxlens/core/flags';
import { buildReport } from '@adxlens/core/reporting';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import type { HandlerMap } from '../handler';

export const reportHandlers: HandlerMap = {
  // Dựng nội dung báo cáo (R02 → R03). Kiểm cờ ở đầu job (CLAUDE.md quy tắc 7).
  'report:build': async (p, { db, log }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p0_reports'))) {
      log.info('cờ báo cáo tắt, bỏ qua');
      return { status: 'flag_off' };
    }
    return { status: await buildReport({ ...ctx, actor: SYSTEM_ACTOR }, p.reportId) };
  },
};
