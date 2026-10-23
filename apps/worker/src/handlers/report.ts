import { isEnabled } from '@adxlens/core/flags';
import { enabledReportSchedules, workspaceTimezones } from '@adxlens/core/ops';
import {
  buildReport,
  digestWeek,
  isDigestDue,
  isDue,
  renderReportPdf,
  runSchedule,
  schedulePeriod,
  sendWeeklyDigest,
} from '@adxlens/core/reporting';
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

  // R05: chạy lịch gửi cho một kỳ (PRD P0-17, P0-24). Kiểm cờ ở đầu job.
  'notify:scheduled_report': async (p, deps) => {
    const ctx = { db: deps.db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p0_reports'))) return { status: 'flag_off' };
    const status = await runSchedule(
      ctx,
      { scheduleId: p.scheduleId, period: p.period },
      {
        email: deps.email,
        publicReportUrl: deps.publicReportUrl,
        enqueue: deps.enqueue,
        llm: deps.llm,
        renderPdf: (id) =>
          deps.renderPdf(
            `${deps.appUrl}/print/report/${id}?key=${encodeURIComponent(deps.sign({ r: id, w: p.workspaceId }, 600))}`,
          ),
      },
    );
    deps.log.info({ schedule_id: p.scheduleId, period: p.period, status }, 'lịch gửi báo cáo');
    return { status };
  },

  // Mỗi giờ: lịch đến giờ theo múi giờ của lịch → enqueue kỳ vừa kết thúc.
  'maintenance:report_tick': async (_p, { db, enqueue }) => {
    const now = new Date();
    const due = (await enabledReportSchedules(db)).filter((s) => isDue(s, now));
    for (const s of due) {
      await enqueue('notify:scheduled_report', {
        workspaceId: s.workspaceId,
        scheduleId: s.id,
        period: schedulePeriod(s, now).key,
      });
    }
    // Digest tuần: thứ Hai 08:00 theo múi giờ workspace (P0-19).
    const digests = (await workspaceTimezones(db)).filter((w) => isDigestDue(w.timezone, now));
    for (const w of digests) await enqueue('notify:digest', { workspaceId: w.id, week: digestWeek(w.timezone, now) });
    return { enqueued: due.length, digests: digests.length };
  },

  // E03 digest tuần (P0-19). Kiểm cờ ở đầu job.
  'notify:digest': async (p, { db, email, appUrl }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p0_reports'))) return { status: 'flag_off' };
    return sendWeeklyDigest(ctx, p.week, { email, appUrl });
  },
};
