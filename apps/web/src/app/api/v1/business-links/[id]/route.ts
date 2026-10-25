import { revokeBusinessLink } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

/** ADR-0028: thu hồi link Business công khai (link chết ngay). */
export const DELETE = route({
  auth: 'workspace',
  flag: 'p0_reports',
  handler: async (ctx) => {
    await revokeBusinessLink(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
