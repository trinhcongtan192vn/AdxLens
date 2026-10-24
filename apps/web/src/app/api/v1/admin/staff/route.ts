import { z } from 'zod';
import { addStaff, listStaff } from '@adxlens/core/ops';
import { schema } from '@adxlens/db';
import { staffActor } from '@/server/admin-flags';
import { route } from '@/server/route';

/** Quản lý staff (ADR-0013): mọi staff xem; chỉ superadmin thêm. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => ({
    me: { user_id: ctx.user.id, role: ctx.staff.role },
    items: (await listStaff(ctx.db)).map((s) => ({
      user_id: s.userId,
      email: s.email,
      full_name: s.fullName,
      role: s.role,
      created_at: s.createdAt,
    })),
  }),
});

export const POST = route({
  auth: 'staff',
  body: z.object({
    email: z.string().trim().email().max(320),
    role: z.enum(schema.STAFF_ROLES),
    reason: z.string().trim().min(5).max(500),
  }),
  handler: async (ctx, { body }) => {
    const r = await addStaff(ctx.db, staffActor(ctx), body);
    return { user_id: r.userId, role: r.role };
  },
});
