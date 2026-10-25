import { z } from 'zod';
import { requestLaunch } from '@adxlens/core/execution';
import { route } from '@/server/route';

const days = z.number().int().min(1).max(365);

/** ADR-0026: custom audience từ pixel (sự kiện website) hoặc tương tác Page / Instagram. Duyệt tay, sau cờ P2a. */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  body: z.object({
    adAccountId: z.string().uuid(),
    name: z.string().trim().min(1).max(150),
    source: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('pixel'),
        id: z.string().regex(/^[\w-]{1,40}$/),
        event: z.enum(['all', 'PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead']),
        days,
      }),
      z.object({ type: z.enum(['page', 'ig_business']), id: z.string().regex(/^[\w-]{1,40}$/), days }),
    ]),
  }),
  handler: async (ctx, { body }) => {
    const a = await requestLaunch(
      ctx,
      { kind: 'create_custom_audience', adAccountId: body.adAccountId, source: body.source, name: body.name },
      { enqueue: ctx.enqueue },
    );
    return { action_ids: [a.id] };
  },
});
