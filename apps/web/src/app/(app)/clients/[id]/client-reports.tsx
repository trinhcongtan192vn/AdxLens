import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { isBlocked, listReports } from '@adxlens/core/reporting';
import { Badge, buttonVariants, Card, CardHeader, EmptyState, Table, TBody, TD, TR } from '@adxlens/ui';
import { getPageContext } from '@/server/page-context';

/** C02 tab Báo cáo: báo cáo của Client (sau cờ p0_reports). */
export async function ClientReports({ clientId, canCreate }: { clientId: string; canCreate: boolean }) {
  const pc = await getPageContext();
  const t = await getTranslations('reports');
  const items = await listReports(pc.ctx, { clientId });
  const create = canCreate ? (
    <Link href={`/reports/new?client=${clientId}`} className={buttonVariants({ kind: 'primary', size: 's' })}>
      {t('create')}
    </Link>
  ) : null;
  return (
    <Card>
      <CardHeader title={t('title')} actions={create} />
      {items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <Table>
          <TBody>
            {items.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/reports/${r.id}`} className="font-medium text-fg hover:text-brand">
                    {r.edits.title || t(`kind.${r.kind === 'audit' ? 'audit' : 'periodic'}`)}
                  </Link>
                </TD>
                <TD className="num">
                  {r.dateFrom} → {r.dateTo}
                </TD>
                <TD>
                  <Badge tone={r.status === 'ready' ? 'success' : r.status === 'failed' ? 'danger' : 'info'}>
                    {t(`status.${r.status}`)}
                  </Badge>
                  {r.status === 'ready' && isBlocked(r.integrity) ? (
                    <Badge tone="warning" className="ml-2">
                      {t('blocked')}
                    </Badge>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
