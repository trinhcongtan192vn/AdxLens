import { z } from 'zod';
import { createReport, isBlocked, listReports } from '@adxlens/core/reporting';
import { route } from '@/server/route';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** R01: danh sách báo cáo. */
export const GET = route({
  auth: 'workspace',
  flag: 'p0_reports',
  query: z.object({ client_id: z.string().uuid().optional() }),
  handler: async (ctx, { query }) => ({
    items: (await listReports(ctx, { clientId: query.client_id })).map((r) => ({
      id: r.id,
      client: { id: r.clientId, name: r.clientName },
      kind: r.kind,
      date_from: r.dateFrom,
      date_to: r.dateTo,
      locale: r.locale,
      status: r.status,
      title: r.edits.title ?? null,
      share_blocked: r.status === 'ready' ? isBlocked(r.integrity) : null,
      created_at: r.createdAt.toISOString(),
    })),
  }),
});

/** R02 (L3 10.2 `POST /reports`): tạo bất đồng bộ; toàn vẹn chặn ở chia sẻ/gửi (ADR-0007). */
export const POST = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  body: z.object({
    client_id: z.string().uuid(),
    kind: z.enum(['audit', 'periodic']),
    date_from: isoDate,
    date_to: isoDate,
    locale: z.enum(['vi', 'en']).optional(),
    template: z.enum(['general', 'ecommerce', 'leadgen']).optional(),
  }),
  handler: async (ctx, { body }) => {
    const r = await createReport(
      ctx,
      {
        clientId: body.client_id,
        kind: body.kind,
        from: body.date_from,
        to: body.date_to,
        locale: body.locale,
        template: body.template,
      },
      { enqueue: ctx.enqueue },
    );
    return Response.json({ report_id: r.id, status: 'building' }, { status: 202 });
  },
});
