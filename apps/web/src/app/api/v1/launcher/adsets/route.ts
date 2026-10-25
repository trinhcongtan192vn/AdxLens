import { z } from 'zod';
import { requestLaunch } from '@adxlens/core/execution';
import { route } from '@/server/route';

/**
 * ADR-0026: nhóm QC mới (luôn PAUSED) trong chiến dịch của nhóm QC mẫu; thiết lập tối ưu chép từ mẫu. Ngân sách ≤ mẫu +
 * ngưỡng guardrail. Duyệt tay, sau cờ P2a.
 */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  body: z.object({
    adAccountId: z.string().uuid(),
    templateAdsetId: z.string().regex(/^\d{1,30}$/),
    name: z.string().trim().min(1).max(150),
    dailyBudget: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,2})?$/)
      .nullable(),
    countries: z
      .array(z.string().regex(/^[A-Za-z]{2}$/))
      .min(1)
      .max(25),
    ageMin: z.number().int().min(18).max(65),
    ageMax: z.number().int().min(18).max(65),
    audienceIds: z.array(z.string().regex(/^[\w-]{1,40}$/)).max(10),
  }),
  handler: async (ctx, { body }) => {
    const a = await requestLaunch(ctx, { kind: 'create_adset', ...body }, { enqueue: ctx.enqueue });
    return { action_ids: [a.id] };
  },
});
