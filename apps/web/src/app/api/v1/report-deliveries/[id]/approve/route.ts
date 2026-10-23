import { approveDelivery } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** R05 "Duyệt & gửi": job gửi kiểm toàn vẹn lần nữa trước khi gửi khách. */
export const POST = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => {
    await approveDelivery(ctx, uuidParam(ctx, 'id'), { enqueue: ctx.enqueue });
    return Response.json({ status: 'approved' }, { status: 202 });
  },
});
