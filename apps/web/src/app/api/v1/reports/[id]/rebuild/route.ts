import { rebuildReport } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** R03 "Dựng lại" sau khi xác nhận gán / đối chiếu lại. */
export const POST = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => {
    await rebuildReport(ctx, uuidParam(ctx, 'id'), { enqueue: ctx.enqueue });
    return Response.json({ status: 'building' }, { status: 202 });
  },
});
