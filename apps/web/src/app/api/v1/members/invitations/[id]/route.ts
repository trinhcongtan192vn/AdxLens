import { revokeInvitation } from '@adxlens/core/tenancy';
import { route, uuidParam } from '@/server/route';

/** Thu hồi lời mời đang chờ. */
export const DELETE = route({
  auth: 'workspace',
  permission: 'members.manage',
  handler: async (ctx) => {
    await revokeInvitation(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
