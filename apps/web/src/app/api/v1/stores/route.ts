import { listStoreConnections } from '@adxlens/core/stores';
import { route } from '@/server/route';

/** ADR-0029: kết nối cửa hàng / analytics của workspace (không token). */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => ({
    items: (await listStoreConnections(ctx)).map((c) => ({
      id: c.id,
      provider: c.provider,
      external_id: c.externalId,
      name: c.name,
      currency: c.currency,
      client_id: c.clientId,
      status: c.status,
      last_synced_at: c.lastSyncedAt?.toISOString() ?? null,
      last_error: c.lastError,
    })),
  }),
});
