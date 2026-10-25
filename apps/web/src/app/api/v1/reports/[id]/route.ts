import { z } from 'zod';
import { deleteReport, getReport, isBlocked, updateReportEdits } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** R03: báo cáo (nội dung có cấu trúc + phần agency viết + trạng thái khóa chia sẻ). */
export const GET = route({
  auth: 'workspace',
  flag: 'p0_reports',
  handler: async (ctx) => {
    const r = await getReport(ctx, uuidParam(ctx, 'id'));
    return {
      id: r.id,
      client_id: r.clientId,
      kind: r.kind,
      date_from: r.dateFrom,
      date_to: r.dateTo,
      locale: r.locale,
      status: r.status,
      content: r.content,
      edits: r.edits,
      summary_text: r.summaryText,
      reconciliation_status: r.reconciliationStatus,
      integrity: r.integrity,
      share_blocked: r.status === 'ready' ? isBlocked(r.integrity) : null,
      error: r.error,
    };
  },
});

export const PATCH = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  body: z.object({
    title: z.string().max(160).optional(),
    intro: z.string().max(2000).optional(),
    workDone: z.string().max(4000).optional(),
    nextSteps: z.string().max(4000).optional(),
    hiddenSections: z
      .array(z.enum(['kpis', 'trend', 'campaigns', 'audience', 'creatives', 'findings', 'workDone', 'nextSteps']))
      .optional(),
    template: z.enum(['general', 'ecommerce', 'leadgen']).optional(),
  }),
  handler: async (ctx, { body }) => ({ edits: await updateReportEdits(ctx, uuidParam(ctx, 'id'), body) }),
});

export const DELETE = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => {
    await deleteReport(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
