import { listMembers, listPendingInvitations } from '@adxlens/core/tenancy';
import { route } from '@/server/route';

/** ST02: thành viên và lời mời đang chờ (owner, manager xem). */
export const GET = route({
  auth: 'workspace',
  permission: 'members.view',
  handler: async (ctx) => {
    const [members, invitations] = await Promise.all([listMembers(ctx), listPendingInvitations(ctx)]);
    return {
      members: members.map((m) => ({
        user_id: m.userId,
        email: m.email,
        full_name: m.fullName,
        role: m.role,
        client_access: m.clientAccess,
        approve_client_ids: m.approveClientIds,
      })),
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        client_access: i.clientAccess,
        created_at: i.createdAt,
        expires_at: i.expiresAt,
        expired: i.expired,
      })),
    };
  },
});
