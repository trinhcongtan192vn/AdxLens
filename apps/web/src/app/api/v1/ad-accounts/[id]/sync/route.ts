import { startBackfill } from '@adxlens/core/ingestion';
import { route, uuidParam } from '@/server/route';

/** S06 "Thử lại đồng bộ": backfill lại khi lần trước lỗi; đang chạy/đã xong thì trả lần hiện có. */
export const POST = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    const r = await startBackfill(ctx, uuidParam(ctx, 'id'), { enqueue: ctx.enqueue });
    return { sync_run_id: r.syncRunId, created: r.created };
  },
});
