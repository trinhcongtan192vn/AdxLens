import { z } from 'zod';
import { incidentDetail, setIncidentStatus } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { route, uuidParam } from '@/server/route';

/** AD03 chi tiết sự cố + lần chạy playbook (staff). */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => {
    const d = await incidentDetail(ctx.db, uuidParam(ctx, 'id'));
    if (!d) throw new AppError('NOT_FOUND', 'Không tìm thấy');
    return d;
  },
});

/** Staff đánh dấu đã giảm thiểu / đã xử lý (có ghi log). */
export const POST = route({
  auth: 'staff',
  body: z.object({ status: z.enum(['mitigated', 'resolved']) }),
  handler: async (ctx, { body }) => {
    const id = uuidParam(ctx, 'id');
    if (!(await incidentDetail(ctx.db, id))) throw new AppError('NOT_FOUND', 'Không tìm thấy');
    await setIncidentStatus(ctx.db, id, body.status);
    ctx.log.info({ incident_id: id, status: body.status }, 'cập nhật sự cố');
    return null;
  },
});
