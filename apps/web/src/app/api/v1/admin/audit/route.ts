import { z } from 'zod';
import { listAdminAudit } from '@adxlens/core/ops';
import { route } from '@/server/route';

/** Nhật ký thao tác admin (ADR-0013): superadmin xem tất cả, operator chỉ dòng của mình. */
export const GET = route({
  auth: 'staff',
  query: z.object({
    action: z.string().max(64).optional(),
    workspace_id: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
  handler: async (ctx, { query }) => ({
    items: (
      await listAdminAudit(ctx.db, {
        onlyActor: ctx.staff.role === 'superadmin' ? undefined : ctx.user.id,
        action: query.action,
        workspaceId: query.workspace_id,
        limit: query.limit,
      })
    ).map((r) => ({
      id: r.id,
      at: r.at,
      action: r.action,
      target_type: r.targetType,
      target_id: r.targetId,
      workspace_id: r.workspaceId,
      reason: r.reason,
      detail: r.detail,
      actor_email: r.actorEmail,
    })),
  }),
});
