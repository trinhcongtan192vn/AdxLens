import { z } from 'zod';
import { schema } from '@adxlens/db';
import { updateWeeklyAction } from '@adxlens/core/recommendation';
import { route, uuidParam } from '@/server/route';

/** P101/P102: đổi trạng thái (bỏ qua kèm lý do) và người được gán (P1-05). Sau cờ `p1_recommendations`. */
export const PATCH = route({
  auth: 'workspace',
  permission: 'recommendations.update',
  flag: 'p1_recommendations',
  body: z
    .object({
      status: z.enum(schema.RECOMMENDATION_STATUSES).optional(),
      skip_reason: z.enum(schema.SKIP_REASONS).nullable().optional(),
      assignee_id: z.string().uuid().nullable().optional(),
    })
    .refine((b) => b.status !== undefined || b.assignee_id !== undefined, { message: 'empty' }),
  handler: async (ctx, { body }) => {
    const r = await updateWeeklyAction(ctx, uuidParam(ctx, 'id'), {
      status: body.status,
      skipReason: body.skip_reason,
      assigneeId: body.assignee_id,
    });
    return { id: r.id, status: r.status, skip_reason: r.skipReason, assignee_id: r.assigneeId };
  },
});
