import { failedJobs, NO_RETRY_QUEUES } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { QUEUES } from '@adxlens/jobs';
import { queueAdmin } from '@/server/queue-admin';
import { route } from '@/server/route';

/** Job lỗi của một queue (staff): lý do lỗi đã che token, không trả payload. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => {
    const queue = ctx.params.queue ?? '';
    if (!Object.hasOwn(QUEUES, queue)) throw new AppError('NOT_FOUND', 'Không tìm thấy');
    return {
      queue,
      retryable: !NO_RETRY_QUEUES.includes(queue),
      items: (await failedJobs(queueAdmin(), queue)).map((j) => ({
        id: j.id,
        name: j.name,
        reason: j.reason,
        attempts: j.attempts,
        failed_at: j.failedAt,
      })),
    };
  },
});
