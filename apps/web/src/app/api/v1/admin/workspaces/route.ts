import { z } from 'zod';
import { adminWorkspaceMatrix } from '@adxlens/core/ops';
import { route } from '@/server/route';

/** AD01: ma trận workspace × cờ (chỉ đội AdxLens). */
export const GET = route({
  auth: 'staff',
  query: z.object({ q: z.string().max(100).optional() }),
  handler: async (ctx, { query }) => ({
    can_enable_flags: ctx.staff.canEnableFlags,
    items: (await adminWorkspaceMatrix(ctx.db, { q: query.q })).map((w) => ({
      id: w.id,
      name: w.name,
      owner_email: w.ownerEmail,
      ad_accounts: w.accounts,
      created_at: w.createdAt.toISOString(),
      flags: w.flags,
    })),
  }),
});
