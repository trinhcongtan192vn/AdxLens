import { deletionRequestsOverview } from '@adxlens/core/ops';
import { route } from '@/server/route';

/** Yêu cầu xóa dữ liệu mọi workspace (staff): trạng thái, hạn, quá hạn. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => ({ items: await deletionRequestsOverview(ctx.db) }),
});
