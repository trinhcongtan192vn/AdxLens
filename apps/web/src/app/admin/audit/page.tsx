import { getFormatter, getTranslations } from 'next-intl/server';
import { listAdminAudit } from '@adxlens/core/ops';
import { Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { auditActionKey } from '@/lib/admin';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';

export async function generateMetadata() {
  const t = await getTranslations('admin.audit');
  return { title: t('title') };
}

/** Nhật ký thao tác admin (ADR-0013): superadmin xem tất cả, operator chỉ dòng của mình. Chỉ đọc. */
export default async function AdminAuditPage() {
  const { staff, user } = await requireStaff();
  const t = await getTranslations('admin.audit');
  const format = await getFormatter();
  const isSuper = staff.role === 'superadmin';
  const rows = await listAdminAudit(deps().db, { onlyActor: isSuper ? undefined : user.id });
  const actionLabel = (a: string) => (t.has(`actions.${auditActionKey(a)}`) ? t(`actions.${auditActionKey(a)}`) : a);
  return (
    <>
      <PageHeader title={t('title')} />
      <p className="mb-3 text-body text-fg-secondary">{isSuper ? t('bodyAll') : t('bodyMine')}</p>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.at')}</TH>
                <TH>{t('cols.actor')}</TH>
                <TH>{t('cols.action')}</TH>
                <TH>{t('cols.target')}</TH>
                <TH>{t('cols.reason')}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD muted className="whitespace-nowrap">
                    {format.dateTime(r.at, { dateStyle: 'short', timeStyle: 'short' })}
                  </TD>
                  <TD>{r.actorEmail ?? '—'}</TD>
                  <TD className="font-medium">{actionLabel(r.action)}</TD>
                  <TD muted className="font-mono text-small">
                    {r.targetType}
                    {r.targetId ? ` · ${r.targetId.slice(0, 8)}` : ''}
                    {r.workspaceId ? ` · ws ${r.workspaceId.slice(0, 8)}` : ''}
                  </TD>
                  <TD muted>{r.reason ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
