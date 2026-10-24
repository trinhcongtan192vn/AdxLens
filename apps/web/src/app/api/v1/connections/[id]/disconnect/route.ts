import { disconnectConnection } from '@adxlens/core/connections';
import { route, uuidParam } from '@/server/route';
import { appBaseUrl } from '@/server/public-base';

/** S07 Ngắt kết nối: xóa token ngay, hẹn xóa dữ liệu quảng cáo sau 7 ngày (P0-22). */
export const POST = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    const r = await disconnectConnection(ctx, uuidParam(ctx, 'id'), {
      enqueue: ctx.enqueue,
      email: ctx.email,
      appUrl: appBaseUrl(ctx.req),
    });
    return { confirmation_code: r.code, purge_after: r.purgeAfter.toISOString() };
  },
});
