import { z } from 'zod';
import { copyRule } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** ADR-0014: sao chép rule sang tài khoản QC khác — mỗi bản sao bắt đầu chạy thử 14 ngày. Sau cờ `p2b_auto`. */
export const POST = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  body: z.object({ ad_account_ids: z.array(z.string().uuid()).min(1).max(20) }),
  handler: async (ctx, { body }) => {
    const r = await copyRule(ctx, uuidParam(ctx, 'id'), body.ad_account_ids);
    return { created: r.created.map((x) => ({ id: x.id, ad_account_id: x.adAccountId })), skipped: r.skipped };
  },
});
