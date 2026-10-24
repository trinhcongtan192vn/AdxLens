import { z } from 'zod';
import { ALERT_METRICS, createAlert, listAlerts } from '@adxlens/core/reporting';
import { route } from '@/server/route';

const dto = (a: Awaited<ReturnType<typeof listAlerts>>[number]) => ({
  id: a.id,
  ad_account_id: a.adAccountId,
  currency: a.currency,
  metric: a.metric,
  condition: a.condition,
  threshold: a.threshold,
  window: a.window,
  enabled: a.enabled,
  last_fired_on: a.lastFiredOn,
  last_value: a.lastValue,
});

/** Cảnh báo tự đặt (ADR-0018). */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => ({ items: (await listAlerts(ctx)).map(dto) }),
});

export const POST = route({
  auth: 'workspace',
  body: z.object({
    adAccountId: z.string().uuid().nullable(),
    metric: z.enum(ALERT_METRICS),
    condition: z.enum(['above', 'below']),
    threshold: z
      .string()
      .trim()
      .regex(/^\d{1,14}(\.\d{1,4})?$/),
    window: z.enum(['1d', '7d']).default('1d'),
  }),
  handler: async (ctx, { body }) => dto(await createAlert(ctx, body)),
});
