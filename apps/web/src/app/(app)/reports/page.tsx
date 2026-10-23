import { FileText } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { isBlocked, listReports } from '@adxlens/core/reporting';
import { Badge, buttonVariants, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('reports');
  return { title: t('title') };
}

/** R01 Danh sách báo cáo (D, E). Sau cờ `p0_reports`. */
export default async function ReportsPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p0_reports');
  requirePermission(pc, 'reports.manage');
  const t = await getTranslations('reports');
  const format = await getFormatter();
  const items = await listReports(pc.ctx);
  const create = (
    <Link href="/reports/new" className={buttonVariants({ kind: 'primary', size: 'm' })}>
      {t('create')}
    </Link>
  );
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return (
    <>
      <PageHeader title={t('title')} actions={items.length ? create : null} />
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<FileText />} title={t('emptyTitle')} description={t('emptyBody')} action={create} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.report')}</TH>
                <TH>{t('cols.client')}</TH>
                <TH>{t('cols.period')}</TH>
                <TH>{t('cols.status')}</TH>
                <TH>{t('cols.created')}</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/reports/${r.id}`} className="font-medium text-fg hover:text-brand">
                      {r.edits.title || `${t(`kind.${r.kind === 'audit' ? 'audit' : 'periodic'}`)} · ${r.clientName}`}
                    </Link>
                  </TD>
                  <TD>{r.clientName}</TD>
                  <TD className="num">
                    {day(r.dateFrom)} – {day(r.dateTo)}
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2">
                      <Badge tone={r.status === 'ready' ? 'success' : r.status === 'failed' ? 'danger' : 'info'}>
                        {t(`status.${r.status}`)}
                      </Badge>
                      {r.status === 'ready' && isBlocked(r.integrity) ? (
                        <Badge tone="warning">{t('blocked')}</Badge>
                      ) : null}
                    </span>
                  </TD>
                  <TD muted>{format.dateTime(r.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
