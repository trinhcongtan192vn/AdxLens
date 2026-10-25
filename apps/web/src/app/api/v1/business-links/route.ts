import { z } from 'zod';
import { createBusinessLink, listBusinessLinks } from '@adxlens/core/reporting';
import { route } from '@/server/route';

const out = (l: Awaited<ReturnType<typeof listBusinessLinks>>[number]) => ({
  id: l.id,
  client_id: l.clientId,
  token: l.token,
  period_days: l.periodDays,
  has_password: Boolean(l.passwordHash),
  expires_at: l.expiresAt?.toISOString() ?? null,
  revoked_at: l.revokedAt?.toISOString() ?? null,
  views: l.viewCount,
});

/** ADR-0028: link Business Dashboard công khai theo Client (quyền báo cáo). Sau cờ P0 Báo cáo. */
export const GET = route({
  auth: 'workspace',
  flag: 'p0_reports',
  handler: async (ctx) => ({ items: (await listBusinessLinks(ctx)).map(out) }),
});

export const POST = route({
  auth: 'workspace',
  flag: 'p0_reports',
  body: z.object({
    client_id: z.string().uuid(),
    period_days: z.union([z.literal(7), z.literal(30)]),
    expires_in_days: z.union([z.literal(7), z.literal(30), z.literal(90)]).nullish(),
    password: z.string().max(128).nullish(),
  }),
  handler: async (ctx, { body }) => {
    const l = await createBusinessLink(ctx, {
      clientId: body.client_id,
      periodDays: body.period_days,
      expiresInDays: body.expires_in_days ?? null,
      password: body.password ?? null,
    });
    return out(l);
  },
});
