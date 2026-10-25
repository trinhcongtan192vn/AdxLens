import { z } from 'zod';
import { CREATIVE_CTAS, requestLaunch } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** ADR-0027: creative ảnh đơn từ bản nháp (Page của workspace, link https). Duyệt tay, sau cờ P2a. */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  body: z.object({
    adAccountId: z.string().uuid(),
    draftId: z.string().uuid(),
    pageId: z.string().regex(/^[\w-]{1,40}$/),
    link: z.string().url().max(1000),
    message: z.string().trim().min(1).max(2000),
    headline: z.string().trim().min(1).max(255),
    cta: z.enum(CREATIVE_CTAS),
    name: z.string().trim().min(1).max(150),
  }),
  handler: async (ctx, { body }) => {
    const a = await requestLaunch(ctx, { kind: 'create_creative', ...body }, { enqueue: ctx.enqueue });
    return { action_ids: [a.id] };
  },
});
