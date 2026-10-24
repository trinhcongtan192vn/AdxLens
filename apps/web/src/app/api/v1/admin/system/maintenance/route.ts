import { z } from 'zod';
import { setMaintenanceNotice } from '@adxlens/core/ops';
import { staffActor } from '@/server/admin-flags';
import { route } from '@/server/route';

/** Superadmin bật / tắt thông báo bảo trì hiện cho mọi khách (văn bản thường, vi + en). */
export const PUT = route({
  auth: 'staff',
  body: z.object({
    active: z.boolean(),
    message_vi: z.string().max(300),
    message_en: z.string().max(300),
    ends_at: z.string().datetime({ offset: true }).nullable(),
    reason: z.string().trim().min(5).max(500),
  }),
  handler: async (ctx, { body }) =>
    setMaintenanceNotice(ctx.db, staffActor(ctx), {
      active: body.active,
      messageVi: body.message_vi,
      messageEn: body.message_en,
      endsAt: body.ends_at,
      reason: body.reason,
    }),
});
