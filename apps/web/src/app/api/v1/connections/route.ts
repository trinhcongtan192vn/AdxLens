import { listConnections } from '@adxlens/core/connections';
import { route } from '@/server/route';

/** S02: kết nối Meta của workspace (không bao giờ có token trong phản hồi). */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => ({
    items: (await listConnections(ctx)).map((c) => ({
      id: c.id,
      meta_user_name: c.metaUserName,
      status: c.status,
      scopes: c.scopes,
      expires_at: c.expiresAt,
      created_at: c.createdAt,
    })),
  }),
});
