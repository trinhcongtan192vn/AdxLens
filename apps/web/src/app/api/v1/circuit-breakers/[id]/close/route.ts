import { closeBreaker } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** P205: Owner mở khóa tài khoản sau khi đã xử lý nguyên nhân lỗi liên tiếp. `id` = ad account. */
export const POST = route({
  auth: 'workspace',
  permission: 'guardrails.manage',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    await closeBreaker(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
