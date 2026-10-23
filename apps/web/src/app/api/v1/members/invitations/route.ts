import { z } from 'zod';
import { createInvitation } from '@adxlens/core/tenancy';
import { sendInvitationEmail } from '@/server/invitations';
import { json, route } from '@/server/route';

/** ST02 "Mời thành viên" (chỉ owner): tạo lời mời 7 ngày và gửi email. */
export const POST = route({
  auth: 'workspace',
  permission: 'members.manage',
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(['manager', 'buyer']),
    clientAccess: z.array(z.string().uuid()).max(500).default([]),
  }),
  handler: async (ctx, { body }) => {
    const inv = await createInvitation(ctx, body);
    await sendInvitationEmail(ctx, {
      workspaceId: ctx.workspaceId,
      inviterUserId: ctx.actor.userId,
      to: body.email,
      role: body.role,
      token: inv.token,
    });
    return json({ id: inv.id, expires_at: inv.expiresAt }, 201);
  },
});
