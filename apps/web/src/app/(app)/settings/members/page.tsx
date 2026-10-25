import { getTranslations } from 'next-intl/server';
import { listClients, listMembers, listPendingInvitations } from '@adxlens/core/tenancy';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { MembersTable } from './table';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('members') };
}

/** ST02 Thành viên & vai trò. Cột "Duyệt hành động" chỉ hiện khi tính năng P2 bật (ux-requirements 9.2). */
export default async function MembersPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'members.view');
  const [members, invitations, clients] = await Promise.all([
    listMembers(pc.ctx),
    listPendingInvitations(pc.ctx),
    listClients(pc.ctx),
  ]);
  return (
    <MembersTable
      canManage={pc.actor.role === 'owner'}
      currentUserId={pc.user.id}
      showApprove={pc.flags.p2a_approve}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      members={members.map((m) => ({
        userId: m.userId,
        email: m.email,
        fullName: m.fullName,
        role: m.role,
        clientAccess: m.clientAccess,
        approveClientIds: m.approveClientIds,
      }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        expired: i.expired,
      }))}
    />
  );
}
