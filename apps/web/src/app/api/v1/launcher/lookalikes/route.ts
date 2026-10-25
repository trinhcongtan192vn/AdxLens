import { z } from 'zod';
import { requestLaunch } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** Audience Launcher (ADR-0023): tạo lookalike 1–10% từ custom audience có sẵn, tối đa 3 tỷ lệ. Sau cờ P2a. */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  body: z.object({
    adAccountId: z.string().uuid(),
    originAudienceId: z.string().regex(/^[\w-]{1,40}$/),
    country: z.string().regex(/^[A-Z]{2}$/),
    ratios: z.array(z.number().int().min(1).max(10)).min(1).max(3),
    name: z.string().trim().min(1).max(150),
  }),
  handler: async (ctx, { body }) => {
    const ids: string[] = [];
    for (const r of [...new Set(body.ratios)]) {
      const a = await requestLaunch(
        ctx,
        {
          kind: 'create_lookalike',
          adAccountId: body.adAccountId,
          originAudienceId: body.originAudienceId,
          country: body.country,
          ratioPct: r,
          name: `${body.name} ${r}% ${body.country}`,
        },
        { enqueue: ctx.enqueue },
      );
      ids.push(a.id);
    }
    return { action_ids: ids };
  },
});
