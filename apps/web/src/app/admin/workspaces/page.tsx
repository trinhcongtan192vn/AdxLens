import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { searchWorkspaces } from '@adxlens/core/ops';
import { Card, EmptyState, Input, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';

export async function generateMetadata() {
  const t = await getTranslations('admin.workspaces');
  return { title: t('title') };
}

/** Tra cứu workspace (hỗ trợ khách): theo tên hoặc email thành viên. */
export default async function AdminWorkspacesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const t = await getTranslations('admin.workspaces');
  const format = await getFormatter();
  const q = (await searchParams).q ?? '';
  const rows = await searchWorkspaces(deps().db, q);
  return (
    <>
      <PageHeader title={t('title')} />
      <form className="mb-3 w-96" action="/admin/workspaces">
        <Input name="q" defaultValue={q} aria-label={t('search')} placeholder={t('search')} />
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.name')}</TH>
                <TH>{t('cols.owner')}</TH>
                <TH numeric>{t('cols.members')}</TH>
                <TH numeric>{t('cols.accounts')}</TH>
                <TH>{t('cols.created')}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((w) => (
                <TR key={w.id}>
                  <TD className="font-medium">
                    <Link href={`/admin/workspaces/${w.id}`} className="text-link hover:underline">
                      {w.name}
                    </Link>
                  </TD>
                  <TD muted>{w.ownerEmail ?? '—'}</TD>
                  <TD numeric>{w.members}</TD>
                  <TD numeric>{w.accounts}</TD>
                  <TD muted>{format.dateTime(w.createdAt, { dateStyle: 'short' })}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
