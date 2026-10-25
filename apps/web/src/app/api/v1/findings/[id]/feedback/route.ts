import { z } from 'zod';
import { recordFeedback } from '@adxlens/core/insight';
import { route, uuidParam } from '@/server/route';

/** L3 10.2 `POST /findings/{id}/feedback`: seen / done / dismissed (cần lý do) / wrong. */
export const POST = route({
  auth: 'workspace',
  body: z.object({
    kind: z.enum(['seen', 'done', 'dismissed', 'wrong']),
    note: z.string().max(500).optional(),
  }),
  handler: async (ctx, { body }) => {
    await recordFeedback(ctx, uuidParam(ctx, 'id'), body);
    return null;
  },
});
