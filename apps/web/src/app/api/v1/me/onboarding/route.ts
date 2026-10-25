import { dismissOnboarding } from '@adxlens/core/recommendation';
import { route } from '@/server/route';

/** A08: đóng màn chào mừng theo vai trò (chỉ của chính mình trong workspace hiện tại). */
export const DELETE = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => {
    await dismissOnboarding(ctx);
    return null;
  },
});
