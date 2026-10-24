import { z } from 'zod';
import { closeBreakerByStaff } from '@adxlens/core/execution';
import { staffActor } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/** Superadmin đóng breaker đang mở của một tài khoản (cho phép ghi Meta lại) — bắt buộc lý do, có nhật ký. */
export const POST = route({
  auth: 'staff',
  body: z.object({ workspace_id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => {
    await closeBreakerByStaff(ctx.db, staffActor(ctx), {
      workspaceId: body.workspace_id,
      adAccountId: uuidParam(ctx, 'adAccountId'),
      reason: body.reason,
    });
    return null;
  },
});
