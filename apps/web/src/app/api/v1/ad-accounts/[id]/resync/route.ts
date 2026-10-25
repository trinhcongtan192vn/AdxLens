import { z } from 'zod';
import { startManualSync } from '@adxlens/core/ingestion';
import { route, uuidParam } from '@/server/route';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** D04 "Chạy lại đồng bộ": đồng bộ lại khoảng ngày rồi tự đối chiếu lại. */
export const POST = route({
  auth: 'workspace',
  permission: 'connections.manage',
  body: z.object({ from: isoDate, to: isoDate }),
  handler: async (ctx, { body }) => {
    const r = await startManualSync(ctx, uuidParam(ctx, 'id'), body, {
      enqueue: ctx.enqueue,
      rejectIfBusy: true,
    });
    return { sync_run_id: r.syncRunId };
  },
});
