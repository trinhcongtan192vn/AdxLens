import { creativeLibrary } from '@adxlens/core/recommendation';
import { creativeDto, creativeQuery } from '@/server/creatives';
import { route } from '@/server/route';

/** P103 Creative library (P1-01, P1-03, P1-07). Sau cờ `p1_recommendations`. */
export const GET = route({
  auth: 'workspace',
  permission: 'insights.view',
  flag: 'p1_recommendations',
  query: creativeQuery,
  handler: async (ctx, { query }) => ({
    items: (await creativeLibrary(ctx, query.account_id, { from: query.from, to: query.to })).map(creativeDto),
  }),
});
