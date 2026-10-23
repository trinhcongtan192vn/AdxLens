import { z } from 'zod';
import { compareCreatives } from '@adxlens/core/recommendation';
import { creativeDto, creativeQuery } from '@/server/creatives';
import { route } from '@/server/route';

/** P104 So sánh creative (P1-02): `ids` = 2–4 mã creative, cách nhau dấu phẩy. Sau cờ `p1_recommendations`. */
export const GET = route({
  auth: 'workspace',
  permission: 'insights.view',
  flag: 'p1_recommendations',
  query: creativeQuery.and(z.object({ ids: z.string().max(400) })),
  handler: async (ctx, { query }) => {
    const ids = query.ids
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const r = await compareCreatives(ctx, query.account_id, ids, { from: query.from, to: query.to });
    return { items: r.rows.map(creativeDto), series: r.series };
  },
});
