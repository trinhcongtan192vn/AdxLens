import { revokeApiKey } from '@adxlens/core/agent';
import { route, uuidParam } from '@/server/route';

/** Thu hồi khóa API (có hiệu lực ngay). */
export const DELETE = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => {
    await revokeApiKey(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
