import { z } from 'zod';
import { adminDeleteUser } from '@adxlens/core/ops';
import { staffActor } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';
import { supabaseAdmin } from '@/server/supabase';

/**
 * Superadmin xóa tài khoản người dùng (gõ đúng email, có lý do, ghi nhật ký admin). Chặn: chính mình, staff, Owner
 * của workspace. Xóa luôn tài khoản đăng nhập (Supabase Auth, service role — chỉ phía server).
 */
export const POST = route({
  auth: 'staff',
  body: z.object({ confirm: z.string().trim().min(3).max(320), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    await adminDeleteUser(
      ctx.db,
      staffActor(ctx),
      { userId: uuidParam(ctx, 'id'), confirmEmail: body.confirm, reason: body.reason },
      {
        deleteLogin: async (id) => {
          const { error } = await supabaseAdmin().auth.admin.deleteUser(id);
          if (error && error.status !== 404) throw error;
        },
      },
    );
    return null;
  },
});
