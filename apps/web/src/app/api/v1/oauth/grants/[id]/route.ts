import { revokeOAuthGrant } from '@adxlens/core/agent';
import { route, uuidParam } from '@/server/route';

/** Thu hồi ứng dụng đã kết nối (có hiệu lực ngay). */
export const DELETE = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => {
    await revokeOAuthGrant(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
