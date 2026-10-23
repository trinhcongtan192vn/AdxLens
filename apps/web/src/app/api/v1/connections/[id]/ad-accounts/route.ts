import { listAvailableAccounts } from '@adxlens/core/connections';
import { route, uuidParam } from '@/server/route';

/** S04: tài khoản QC truy cập được qua kết nối (L2 8.2). */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => ({ items: await listAvailableAccounts(ctx, uuidParam(ctx, 'id')) }),
});
