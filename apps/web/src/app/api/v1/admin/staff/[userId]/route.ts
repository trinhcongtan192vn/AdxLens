import { z } from 'zod';
import { removeStaff, setStaffRole } from '@adxlens/core/ops';
import { schema } from '@adxlens/db';
import { staffActor } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/** Đổi vai trò staff (superadmin; không tự đổi mình, không hạ superadmin cuối cùng). */
export const PATCH = route({
  auth: 'staff',
  body: z.object({ role: z.enum(schema.STAFF_ROLES), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    const r = await setStaffRole(ctx.db, staffActor(ctx), { userId: uuidParam(ctx, 'userId'), ...body });
    return { user_id: r.userId, role: r.role };
  },
});

/** Gỡ quyền staff (superadmin). Lý do qua query `reason`. */
export const DELETE = route({
  auth: 'staff',
  query: z.object({ reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { query }) => {
    await removeStaff(ctx.db, staffActor(ctx), { userId: uuidParam(ctx, 'userId'), reason: query.reason });
    return null;
  },
});
