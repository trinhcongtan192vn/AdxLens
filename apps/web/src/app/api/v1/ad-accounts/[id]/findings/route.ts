import { z } from 'zod';
import { listAdAccounts } from '@adxlens/core/connections';
import { listFindings } from '@adxlens/core/insight';
import { findingDto } from '@/server/findings';
import { route, uuidParam } from '@/server/route';
import { requestLocale } from '@/server/translate';

/** L3 10.2 `GET /ad-accounts/{id}/findings` (D02). Mặc định chỉ phát hiện đang mở. */
export const GET = route({
  auth: 'workspace',
  query: z.object({
    severity: z.enum(['low', 'medium', 'high']).optional(),
    group: z.string().max(64).optional(),
    status: z.enum(['new', 'seen', 'done', 'dismissed', 'resolved']).optional(),
    cursor: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
  handler: async (ctx, { query }) => {
    const id = uuidParam(ctx, 'id');
    const r = await listFindings(ctx, id, query);
    const currency = (await listAdAccounts(ctx)).find((a) => a.id === id)?.currency ?? null;
    const locale = requestLocale(ctx.req);
    return { items: r.items.map((f) => findingDto(f, locale, currency)), next_cursor: r.nextCursor };
  },
});
