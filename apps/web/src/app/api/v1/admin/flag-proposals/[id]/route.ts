import { z } from 'zod';
import { approveFlagProposal, closeFlagProposal } from '@adxlens/core/flags';
import { staffActor } from '@/server/admin-flags';
import { route, uuidParam } from '@/server/route';

/**
 * Xử lý đề xuất: `approve` (superadmin; bật cờ qua core/flags, checklist vẫn chạy), `reject` (superadmin, cần lý do),
 * `cancel` (người đề xuất).
 */
export const POST = route({
  auth: 'staff',
  body: z.discriminatedUnion('decision', [
    z.object({
      decision: z.literal('approve'),
      note: z.string().trim().max(500).optional(),
      override: z.boolean().optional(),
    }),
    z.object({ decision: z.enum(['reject', 'cancel']), note: z.string().trim().min(5).max(500) }),
  ]),
  handler: async (ctx, { body }) => {
    const id = uuidParam(ctx, 'id');
    if (body.decision === 'approve') {
      const r = await approveFlagProposal(ctx.db, staffActor(ctx), { id, note: body.note, override: body.override });
      return { status: 'approved', override: r.override, checklist: r.checklist };
    }
    await closeFlagProposal(ctx.db, staffActor(ctx), {
      id,
      decision: body.decision === 'reject' ? 'rejected' : 'canceled',
      note: body.note,
    });
    return { status: body.decision === 'reject' ? 'rejected' : 'canceled' };
  },
});
