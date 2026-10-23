import { z } from 'zod';
import { schema } from '@adxlens/db';
import { listActions } from '@adxlens/core/execution';
import { actionDto } from '@/server/actions';
import { route } from '@/server/route';

/** P203 Nhật ký hành động (P2-05). Sau cờ `p2a_approve`. */
export const GET = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  query: z.object({
    status: z.enum(schema.ACTION_STATUSES).optional(),
    ad_account_id: z.string().uuid().optional(),
  }),
  handler: async (ctx, { query }) => ({
    items: (await listActions(ctx, { status: query.status, adAccountId: query.ad_account_id })).map(actionDto),
  }),
});
