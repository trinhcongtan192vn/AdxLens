import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { deletionRequestsOverview } from '@adxlens/core/ops';
import { Badge, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';

export async function generateMetadata() {
  const t = await getTranslations('admin.deletions');
  return { title: t('title') };
}

/** Yêu cầu xóa dữ liệu (chính sách Meta): theo dõi hạn cam kết; quá hạn nổi lên đầu. Chỉ xem — worker tự xóa. */
export default async function AdminDeletionsPage() {
  await requireStaff();
  const t = await getTranslations('admin.deletions');
  const format = await getFormatter();
  const rows = (await deletionRequestsOverview(deps().db)).sort((a, b) => Number(b.overdue) - Number(a.overdue));
  const overdue = rows.filter((r) => r.overdue).length;
  const dt = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: 'short', timeStyle: 'short' }) : '—');
  return (
    <>
      <PageHeader title={t('title')} />
      <p className="mb-3 max-w-[820px] text-body text-fg-secondary">{t('body')}</p>
      {overdue ? (
        <p className="mb-3 text-body font-medium text-danger" data-testid="deletions-overdue">
          {t('overdueCount', { count: overdue })}
        </p>
      ) : null}
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.code')}</TH>
                <TH>{t('cols.workspace')}</TH>
                <TH>{t('cols.source')}</TH>
                <TH>{t('cols.status')}</TH>
                <TH>{t('cols.purgeAfter')}</TH>
                <TH>{t('cols.completed')}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono">{r.code}</TD>
                  <TD>
                    {r.workspaceName ? (
                      <Link href={`/admin/workspaces/${r.workspaceId}`} className="text-link hover:underline">
                        {r.workspaceName}
                      </Link>
                    ) : (
                      <span className="text-fg-tertiary">{t('deletedWorkspace')}</span>
                    )}
                  </TD>
                  <TD muted>{r.source}</TD>
                  <TD>
                    <Badge tone={r.status === 'done' ? 'success' : r.overdue ? 'danger' : 'warning'}>
                      {r.overdue ? t('overdue') : r.status}
                    </Badge>
                  </TD>
                  <TD muted>{dt(r.purgeAfter)}</TD>
                  <TD muted>{dt(r.completedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
