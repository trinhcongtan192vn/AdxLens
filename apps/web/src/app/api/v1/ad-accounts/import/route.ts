import { z } from 'zod';
import { importAccounts } from '@adxlens/core/connections';
import { route } from '@/server/route';

/** POST /ad-accounts/import (L3 10.2): nhập tài khoản đã chọn, nhận gợi ý Client. */
export const POST = route({
  auth: 'workspace',
  permission: 'connections.manage',
  body: z.object({
    connection_id: z.string().uuid(),
    meta_account_ids: z
      .array(z.string().regex(/^act_\d+$/))
      .min(1)
      .max(200),
  }),
  handler: async (ctx, { body }) => {
    const items = await importAccounts(ctx, {
      connectionId: body.connection_id,
      metaAccountIds: body.meta_account_ids,
    });
    return {
      items: items.map((i) => ({
        ad_account_id: i.adAccountId,
        meta_account_id: i.metaAccountId,
        name: i.name,
        currency: i.currency,
        timezone: i.timezone,
        suggested_client: i.suggestedClient,
        assignment_status: i.assignmentStatus,
      })),
    };
  },
});
