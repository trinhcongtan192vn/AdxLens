import { z } from 'zod';
import { AppError } from '@adxlens/core/shared';
import { transferOwnership } from '@adxlens/core/tenancy';
import { verifyPassword } from '@/server/auth';
import { route, uuidParam } from '@/server/route';

/** Chuyển quyền owner cho một manager (ADR-0001 B8): xác nhận lại bằng mật khẩu của owner hiện tại. */
export const POST = route({
  auth: 'workspace',
  permission: 'ownership.transfer',
  body: z.object({ password: z.string().min(1) }),
  handler: async (ctx, { body }) => {
    if (!(await verifyPassword(ctx.user.email, body.password))) {
      throw new AppError('FORBIDDEN', 'Mật khẩu không đúng', { field: 'password' });
    }
    await transferOwnership(ctx, uuidParam(ctx, 'userId'));
    return null;
  },
});
