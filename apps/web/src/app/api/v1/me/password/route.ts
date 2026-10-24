import { z } from 'zod';
import { AppError } from '@adxlens/core/shared';
import { account } from '@/server/account';
import { MIN_PASSWORD } from '@/server/auth-flows';
import { verifyPassword } from '@/server/auth';
import { route } from '@/server/route';

/** ST06 "Đổi mật khẩu": cần mật khẩu hiện tại; đổi xong đăng xuất các phiên khác. */
export const POST = route({
  auth: 'user',
  body: z
    .object({
      currentPassword: z.string().min(1),
      password: z.string().min(MIN_PASSWORD).max(128),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'mismatch' }),
  handler: async ({ user }, { body }) => {
    if (!(await verifyPassword(user.email, body.currentPassword))) {
      throw new AppError('FORBIDDEN', 'Mật khẩu hiện tại không đúng', { field: 'currentPassword' });
    }
    const r = await account().changePassword(body.password);
    if (!r.ok)
      throw new AppError('VALIDATION_FAILED', 'Không đổi được mật khẩu', { field: 'password', reason: r.code });
    return null;
  },
});
