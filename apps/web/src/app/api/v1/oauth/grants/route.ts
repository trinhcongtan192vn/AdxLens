import { listOAuthGrants } from '@adxlens/core/agent';
import { route } from '@/server/route';

/** Ứng dụng đã kết nối qua OAuth (ADR-0022 B): của mình; Owner / Manager thấy cả workspace. */
export const GET = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => ({
    items: (await listOAuthGrants(ctx)).map((g) => ({
      id: g.id,
      client_name: g.clientName,
      scopes: g.scopes,
      mine: g.mine,
      last_used_at: g.lastUsedAt?.toISOString() ?? null,
      created_at: g.createdAt.toISOString(),
    })),
  }),
});
