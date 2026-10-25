import { revokeShareLink } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** Thu hồi link chia sẻ (link chết ngay). */
export const DELETE = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => {
    await revokeShareLink(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
