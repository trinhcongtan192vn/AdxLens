import { markRead } from '@adxlens/core/notification';
import { route, uuidParam } from '@/server/route';

/** Đánh dấu đã đọc một thông báo (chỉ của chính mình). */
export const POST = route({
  auth: 'workspace',
  handler: async (ctx) => {
    await markRead(ctx, ctx.actor.userId, uuidParam(ctx, 'id'));
    return null;
  },
});
