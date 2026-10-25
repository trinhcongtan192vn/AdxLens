import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { listOutcomes, type Outcome } from '@adxlens/core/recommendation';
import { Badge, Banner, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { getPageContext, requireFlag } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('outcomes');
  return { title: t('title') };
}

/**
 * P105 Kết quả trước / sau (P1-08): chỉ số chính 7 ngày trước và sau ngày đánh dấu "Đã làm". Ghi rõ đây
 * không phải chứng minh nhân quả. Sau cờ `p1_recommendations`.
 */
export default async function OutcomesPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const t = await getTranslations('outcomes');
  const tw = await getTranslations('weekly');
  const format = await getFormatter();
  const items = await listOutcomes(pc.ctx);
  const show = (o: Outcome, v: string | number | null) => {
    if (v === null) return '—';
    if (o.metric === 'ctr') return format.number(Number(v), { style: 'percent', maximumFractionDigits: 2 });
    if (o.metric === 'results') return format.number(Number(v));
    return format.number(Number(v), {
      style: 'currency',
      currency: o.currency,
      maximumFractionDigits: o.currency === 'VND' ? 0 : 2,
    });
  };
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="w" href="/weekly-actions" className="hover:text-fg">
            {tw('title')}
          </Link>,
          t('title'),
        ]}
        title={t('title')}
      />
      <Banner tone="info" className="mb-4">
        {t('causality')}
      </Banner>
      {items.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{t('cols.item')}</TH>
                <TH>{t('cols.doneOn')}</TH>
                <TH>{t('cols.metric')}</TH>
                <TH numeric>{t('cols.before')}</TH>
                <TH numeric>{t('cols.after')}</TH>
                <TH numeric>{t('cols.change')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((o) => (
                <TR key={o.id} data-testid="outcome-row">
                  <TD>
                    <span className="font-medium text-fg">{o.entityName}</span>
                    <span className="block text-small text-fg-secondary">{o.accountName}</span>
                  </TD>
                  <TD muted>{date(o.doneDate)}</TD>
                  <TD muted>{o.metric ? `${t(`metric.${o.metric}`)} · ${t(`scope.${o.scope}`)}` : t('notMeasured')}</TD>
                  {o.state === 'waiting' ? (
                    <TD colSpan={3} muted>
                      {t('waiting', { date: date(o.readyOn) })}
                    </TD>
                  ) : o.state === 'not_measured' ? (
                    <TD colSpan={3} muted>
                      {t('notMeasuredBody')}
                    </TD>
                  ) : (
                    <>
                      <TD numeric>{show(o, o.before)}</TD>
                      <TD numeric>{show(o, o.after)}</TD>
                      <TD numeric>
                        {o.changePct === null ? (
                          '—'
                        ) : (
                          <Badge tone={o.improved === null ? 'neutral' : o.improved ? 'success' : 'danger'}>
                            {format.number(Number(o.changePct) / 100, {
                              style: 'percent',
                              maximumFractionDigits: 1,
                              signDisplay: 'exceptZero',
                            })}
                          </Badge>
                        )}
                      </TD>
                    </>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
