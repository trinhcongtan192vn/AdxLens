import { z } from 'zod';
import { createShareLink, listShareLinks } from '@adxlens/core/reporting';
import { route, uuidParam } from '@/server/route';
import { reportBaseUrl } from '@/server/public-base';

const url = (req: Request, token: string) => `${reportBaseUrl(req)}/${token}`;

/** R04: link chia sẻ của báo cáo. */
export const GET = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  handler: async (ctx) => ({
    items: (await listShareLinks(ctx, uuidParam(ctx, 'id'))).map((l) => ({
      id: l.id,
      url: url(ctx.req, l.token),
      has_password: l.passwordHash !== null,
      expires_at: l.expiresAt?.toISOString() ?? null,
      revoked_at: l.revokedAt?.toISOString() ?? null,
      view_count: l.viewCount,
      last_viewed_at: l.lastViewedAt?.toISOString() ?? null,
      created_at: l.createdAt.toISOString(),
    })),
  }),
});

/** L3 10.2 `POST /reports/{id}/share-links`: 422 REPORT_BLOCKED khi chưa toàn vẹn (ADR-0007). */
export const POST = route({
  auth: 'workspace',
  permission: 'reports.manage',
  flag: 'p0_reports',
  body: z.object({
    expires_in_days: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .nullable()
      .optional(),
    password: z.string().min(6).max(128).optional(),
  }),
  handler: async (ctx, { body }) => {
    const l = await createShareLink(ctx, uuidParam(ctx, 'id'), {
      expiresInDays: body.expires_in_days ?? null,
      password: body.password ?? null,
    });
    return Response.json(
      {
        id: l.id,
        url: url(ctx.req, l.token),
        expires_at: l.expiresAt?.toISOString() ?? null,
        has_password: l.passwordHash !== null,
      },
      { status: 201 },
    );
  },
});
