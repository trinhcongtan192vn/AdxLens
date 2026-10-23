import { z } from 'zod';
import { handleFailedJob } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { QUEUES } from '@adxlens/jobs';
import { staffActor } from '@/server/admin-flags';
import { queueAdmin } from '@/server/queue-admin';
import { route } from '@/server/route';

/** Chạy lại / bỏ một job lỗi (staff, có lý do + nhật ký). Queue ghi Meta (`execute`) chỉ bỏ được (ADR-0008). */
export const POST = route({
  auth: 'staff',
  body: z.object({ action: z.enum(['retry', 'discard']), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    const queue = ctx.params.queue ?? '';
    const jobId = ctx.params.jobId ?? '';
    if (!Object.hasOwn(QUEUES, queue) || !jobId || jobId.length > 200)
      throw new AppError('NOT_FOUND', 'Không tìm thấy');
    await handleFailedJob(ctx.db, queueAdmin(), staffActor(ctx), { queue, jobId, ...body });
    return null;
  },
});
