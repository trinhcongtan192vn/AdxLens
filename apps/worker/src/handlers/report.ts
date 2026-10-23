import { isEnabled } from '@adxlens/core/flags';
import { buildReport, renderReportPdf } from '@adxlens/core/reporting';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import type { HandlerMap } from '../handler';

export const reportHandlers: HandlerMap = {
  // Dựng nội dung báo cáo (R02 → R03). Kiểm cờ ở đầu job (CLAUDE.md quy tắc 7).
  'report:build': async (p, { db, log, llm }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p0_reports'))) {
      log.info('cờ báo cáo tắt, bỏ qua');
      return { status: 'flag_off' };
    }
    return { status: await buildReport({ ...ctx, actor: SYSTEM_ACTOR }, p.reportId, undefined, { llm }) };
  },

  // R07: PDF A4 qua Playwright từ trang in nội bộ (URL ký 10 phút). Kiểm cờ + toàn vẹn ở đầu job.
  'pdf:render': async (p, { db, log, appUrl, renderPdf, uploadReport, sign }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p0_reports'))) {
      log.info('cờ báo cáo tắt, bỏ qua');
      return { status: 'flag_off' };
    }
    const status = await renderReportPdf({ ...ctx, actor: SYSTEM_ACTOR }, p, {
      printUrl: (id) =>
        `${appUrl}/print/report/${id}?key=${encodeURIComponent(sign({ r: id, w: p.workspaceId }, 600))}`,
      render: renderPdf,
      upload: uploadReport,
    });
    return { status };
  },
};
