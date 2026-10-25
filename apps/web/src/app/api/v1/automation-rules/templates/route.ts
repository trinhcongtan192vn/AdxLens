import { listRuleTemplates } from '@adxlens/core/execution';
import { route } from '@/server/route';

/** P212 mẫu dựng sẵn từ gợi ý P1, sắp theo số lần được làm (P2-10). */
export const GET = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  handler: async (ctx) => ({ items: await listRuleTemplates(ctx) }),
});
