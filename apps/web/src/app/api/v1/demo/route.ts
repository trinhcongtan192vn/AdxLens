import { removeDemo, startDemo } from '@adxlens/core/connections';
import { startBackfill } from '@adxlens/core/ingestion';
import { tokenKeys } from '@/server/meta';
import { route } from '@/server/route';

/** S01 "Dùng tài khoản mẫu" (PRD P0-02): tạo dữ liệu mẫu (Meta giả), bắt đầu đồng bộ. */
export const POST = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    const r = await startDemo(ctx, {
      keys: tokenKeys(),
      enqueue: ctx.enqueue,
      startBackfill: (id) => startBackfill(ctx, id, { enqueue: ctx.enqueue }),
    });
    return { connection_id: r.connectionId, created: r.created };
  },
});

/** "Xóa dữ liệu mẫu". */
export const DELETE = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    await removeDemo(ctx);
    return null;
  },
});
