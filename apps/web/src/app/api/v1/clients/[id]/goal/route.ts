import { z } from 'zod';
import { GOAL_METRICS, getClientGoal, saveClientGoal } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';

const metric = z.enum(GOAL_METRICS);
const metaId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w.-]+$/);

/** Mục tiêu KPI + ngành + tài sản mặc định của Client (ADR-0017). */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => {
    const g = await getClientGoal(ctx, uuidParam(ctx, 'id'));
    return g ? { ...g, onboardedAt: g.onboardedAt?.toISOString() ?? null } : null;
  },
});

/** Lưu một phần (từng bước onboarding). `complete` = xong / "Để sau". */
export const PUT = route({
  auth: 'workspace',
  permission: 'clients.manage',
  body: z.object({
    primaryMetric: metric.nullable().optional(),
    primaryTarget: z
      .string()
      .trim()
      .regex(/^\d{1,14}(\.\d{1,4})?$/)
      .nullable()
      .optional(),
    secondaryMetrics: z.array(metric).max(2).optional(),
    industry: z.string().max(40).nullable().optional(),
    subIndustry: z.string().max(40).nullable().optional(),
    defaultPageId: metaId.nullable().optional(),
    defaultInstagramId: metaId.nullable().optional(),
    defaultPixelId: metaId.nullable().optional(),
    complete: z.boolean().optional(),
  }),
  handler: async (ctx, { body }) => {
    const g = await saveClientGoal(ctx, uuidParam(ctx, 'id'), body);
    return { ...g, onboardedAt: g.onboardedAt?.toISOString() ?? null };
  },
});
