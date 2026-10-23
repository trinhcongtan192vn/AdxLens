'use client';

import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { EditMemberDialog, InviteDialog, type ClientOpt, type Member } from './dialogs';

type Invitation = { id: string; email: string; role: string; createdAt: string; expired: boolean };

const ROLE_TONE = { owner: 'info', manager: 'neutral', buyer: 'neutral' } as const;

export function MembersTable({
  canManage,
  currentUserId,
  showApprove,
  clients,
  members,
  invitations,
}: {
  canManage: boolean;
  currentUserId: string;
  showApprove: boolean;
  clients: ClientOpt[];
  members: Member[];
  invitations: Invitation[];
}) {
  const t = useTranslations('settingsMembers');
  const tc = useTranslations('common');
  const format = useFormatter();
  const now = useNow();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [pending, start] = useTransition();
  const total = members.length + invitations.length;

  const clientsLabel = (ids: string[], role: string) =>
    role === 'owner' || (ids.length === 0 && role === 'manager')
      ? t('allClients')
      : ids.length === 0
        ? '—'
        : t('nClients', { count: ids.length });
  const approveLabel = (m: Member) =>
    m.role === 'owner' || m.role === 'manager'
      ? t('approveYes')
      : m.approveClientIds.length === 0
        ? t('approveNo')
        : t('approveByClient');

  const resend = (id: string) =>
    start(async () => {
      try {
        await api(`members/invitations/${id}/resend`, { method: 'POST', body: {} });
        toast.success(t('resent'));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-h2 font-semibold text-fg">{t('title')}</h2>
        <Badge>{t('count', { count: total })}</Badge>
        <div className="flex-1" />
        {canManage ? (
          <Button kind="primary" size="m" onClick={() => setInviteOpen(true)}>
            {t('invite')}
          </Button>
        ) : null}
      </div>

      <Card>
        {members.length === 1 && invitations.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={t('emptyTitle')}
            description={t('emptyBody')}
            action={
              canManage ? (
                <Button kind="primary" size="m" onClick={() => setInviteOpen(true)}>
                  {t('invite')}
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.member')}</TH>
                <TH>{t('cols.email')}</TH>
                <TH>{t('cols.role')}</TH>
                <TH>{t('cols.clients')}</TH>
                {showApprove ? <TH>{t('cols.approve')}</TH> : null}
                <TH>{t('cols.status')}</TH>
                <TH className="w-20" />
              </tr>
            </THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.userId}>
                  <TD>{m.fullName ?? m.email}</TD>
                  <TD>{m.email}</TD>
                  <TD>
                    <Badge tone={ROLE_TONE[m.role as keyof typeof ROLE_TONE] ?? 'neutral'}>
                      {t(`roles.${m.role}`)}
                    </Badge>
                  </TD>
                  <TD>{clientsLabel(m.clientAccess, m.role)}</TD>
                  {showApprove ? <TD>{approveLabel(m)}</TD> : null}
                  <TD>
                    <Badge tone="success">{t('active')}</Badge>
                  </TD>
                  <TD className="text-right">
                    {canManage && m.role !== 'owner' ? (
                      <Button kind="secondary" size="s" onClick={() => setEditing(m)}>
                        {tc('edit')}
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
              {invitations.map((i) => (
                <TR key={i.id}>
                  <TD>{i.email}</TD>
                  <TD>{i.email}</TD>
                  <TD>
                    <Badge tone="warning">{t('notAccepted')}</Badge>
                  </TD>
                  <TD muted>—</TD>
                  {showApprove ? <TD muted>—</TD> : null}
                  <TD>
                    <Badge tone="warning">
                      {i.expired
                        ? t('inviteExpired')
                        : t('invitedAgo', {
                            // Đồng hồ DB và trình duyệt lệch vài giây: không bao giờ hiển thị thời điểm tương lai.
                            ago: format.relativeTime(new Date(Math.min(Date.parse(i.createdAt), now.getTime())), now),
                          })}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {canManage ? (
                      <Button kind="secondary" size="s" disabled={pending} onClick={() => resend(i.id)}>
                        {t('resend')}
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {showApprove ? <p className="mt-2 text-small text-fg-tertiary">{t('approveNote')}</p> : null}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} clients={clients} />
      {editing ? (
        <EditMemberDialog
          member={editing}
          clients={clients}
          showApprove={showApprove}
          isSelf={editing.userId === currentUserId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
