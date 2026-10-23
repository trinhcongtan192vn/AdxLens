import { z } from 'zod';
import { listClientOverview, unconfirmedCount } from '@adxlens/core/connections';
import { createClient } from '@adxlens/core/tenancy';
import { route } from '@/server/route';

/** C01: danh sách Client kèm tài khoản QC đã gán và số tài khoản chưa xác nhận (BR01). */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => {
    const [items, unconfirmed] = await Promise.all([listClientOverview(ctx), unconfirmedCount(ctx)]);
    return {
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        created_at: c.createdAt.toISOString(),
        ad_accounts: c.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          meta_account_id: a.metaAccountId,
          assignment_status: a.assignmentStatus,
          connection_status: a.connectionStatus,
        })),
      })),
      unconfirmed_accounts: unconfirmed,
    };
  },
});

/** "+ Thêm Client". */
export const POST = route({
  auth: 'workspace',
  permission: 'clients.manage',
  body: z.object({ name: z.string().trim().min(1).max(120) }),
  handler: async (ctx, { body }) => {
    const c = await createClient(ctx, { name: body.name });
    return { id: c.id, name: c.name };
  },
});
