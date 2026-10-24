import { z } from 'zod';
import { suggestTemplateValues } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** Ngưỡng gợi ý từ dữ liệu 30 ngày của tài khoản cho một mẫu rule, kèm lý do ("Vì sao giá trị này?"). */
export const GET = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  query: z.object({ template: z.string().max(60), adAccountId: z.string().uuid() }),
  handler: async (ctx, { query }) => suggestTemplateValues(ctx, query.template, query.adAccountId),
});
