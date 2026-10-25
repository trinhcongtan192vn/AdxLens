import { z } from 'zod';
import { adminDeleteWorkspace } from '@adxlens/core/ops';
import { staffActor } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/** Superadmin xóa vĩnh viễn workspace (gõ đúng tên để xác nhận, có lý do, ghi nhật ký admin). */
export const POST = route({
  auth: 'staff',
  body: z.object({ confirm: z.string().trim().min(1).max(200), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    await adminDeleteWorkspace(ctx.db, staffActor(ctx), {
      workspaceId: uuidParam(ctx, 'id'),
      confirmName: body.confirm,
      reason: body.reason,
    });
    return null;
  },
});
