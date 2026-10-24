import { pdfStatus, requestPdf } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** R04 / L3 10.2 `POST /reports/{id}/pdf`: enqueue render (202); đã có → 200 kèm URL ký 1 giờ. */
export const POST = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => {
    const r = await requestPdf(ctx, uuidParam(ctx, 'id'), { enqueue: ctx.enqueue });
    if (r.state === 'ready') return { state: 'ready', url: await ctx.storage.signedUrl('reports', r.path, 3600) };
    return Response.json({ state: 'queued' }, { status: 202 });
  },
});

/** Trạng thái PDF phiên bản hiện tại; sẵn sàng → URL ký 1 giờ (L3 4.2). */
export const GET = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => {
    const s = await pdfStatus(ctx, uuidParam(ctx, 'id'));
    return s.state === 'ready' && s.path
      ? { state: 'ready', url: await ctx.storage.signedUrl('reports', s.path, 3600) }
      : { state: 'none', url: null };
  },
});
