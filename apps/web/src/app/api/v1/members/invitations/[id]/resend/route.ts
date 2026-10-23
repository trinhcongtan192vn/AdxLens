import { resendInvitation } from '@adxlens/core/tenancy';
import { sendInvitationEmail } from '@/server/invitations';
import { route, uuidParam } from '@/server/route';

/** ST02 "Gửi lại": token mới, hạn mới 7 ngày, gửi lại email. */
export const POST = route({
  auth: 'workspace',
  permission: 'members.manage',
  handler: async (ctx) => {
    const r = await resendInvitation(ctx, uuidParam(ctx, 'id'));
    await sendInvitationEmail(ctx, {
      workspaceId: ctx.workspaceId,
      inviterUserId: ctx.actor.userId,
      to: r.email,
      role: r.role,
      token: r.token,
    });
    return { expires_at: r.expiresAt };
  },
});
