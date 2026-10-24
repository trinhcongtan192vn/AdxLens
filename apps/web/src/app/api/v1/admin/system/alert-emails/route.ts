import { z } from 'zod';
import { setOpsAlertEmails } from '@adxlens/core/ops';
import { staffActor } from '@/server/admin-flags';
import { route } from '@/server/route';

/** Superadmin đặt email nhận cảnh báo sự cố P1/P2 (gộp với OPS_ALERT_EMAILS). */
export const PUT = route({
  auth: 'staff',
  body: z.object({ emails: z.array(z.string().trim().max(320)).max(20), reason: z.string().trim().min(5).max(500) }),
  handler: async (ctx, { body }) => ({ emails: await setOpsAlertEmails(ctx.db, staffActor(ctx), body) }),
});
