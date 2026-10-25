import { z } from 'zod';
import { schema } from '@adxlens/db';
import { listWeeklyActions } from '@adxlens/core/recommendation';
import { recommendationDto } from '@/server/recommendations';
import { route } from '@/server/route';

/** P101 Weekly Action List (P1-04). `assignee=me` lọc việc của tôi. Sau cờ `p1_recommendations`. */
export const GET = route({
  auth: 'workspace',
  permission: 'insights.view',
  flag: 'p1_recommendations',
  query: z.object({
    week: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    status: z.enum(schema.RECOMMENDATION_STATUSES).optional(),
    assignee: z.union([z.literal('me'), z.string().uuid()]).optional(),
  }),
  handler: async (ctx, { query }) => {
    const r = await listWeeklyActions(ctx, {
      week: query.week,
      status: query.status,
      assignee: query.assignee === 'me' ? ctx.actor.userId : query.assignee,
    });
    return { week: r.week, weeks: r.weeks, items: r.items.map(recommendationDto) };
  },
});
