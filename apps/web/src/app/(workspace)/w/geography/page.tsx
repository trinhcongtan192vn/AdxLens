import { getLocale, getTranslations } from 'next-intl/server';
import { geographyAnalysis } from '@adxlens/core/reporting';
import { Badge, Banner, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.geography') };
}

/**
 * W8 — Địa lý (Madgicx "Geography" + "Wasted spend"): theo khu vực Meta trả về, thanh tỷ trọng chi tiêu, CPA, CTR, đánh
 * dấu khu vực có chi tiêu mà không có kết quả.
 */
export default async function GeographyPage() {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsGeo');
  const tw = await getTranslations('ws');
  const locale = await getLocale();
  const { rows, wastedSpend } = await geographyAnalysis(pc.ctx, scope.ids, scope.cur);
  const money = (v: string | null) => formatMetric('spend', v, scope.currency, locale);
  const maxShare = Math.max(1, ...rows.map((r) => r.share));
  return (
    <>
      <WsHeader
        title={tw('nav.geography')}
        subtitle={t('subtitle')}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <>
          {Number(wastedSpend) > 0 ? (
            <Banner tone="warning" className="mb-3">
              {t('wasted', { amount: money(wastedSpend), n: rows.filter((r) => r.wasted).length })}
            </Banner>
          ) : null}
          <Card className="overflow-x-auto p-0">
            <Table data-testid="geo-table">
              <THead>
                <tr>
                  <TH>{t('region')}</TH>
                  <TH className="w-[30%]">{t('share')}</TH>
                  <TH numeric>{t('spend')}</TH>
                  <TH numeric>{t('results')}</TH>
                  <TH numeric>{t('cpa')}</TH>
                  <TH numeric>{t('ctr')}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.key}>
                    <TD>
                      {r.key === 'unknown' || !r.key ? t('unknown') : r.key}{' '}
                      {r.wasted ? <Badge tone="warning">{t('noResults')}</Badge> : null}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-subtle">
                          <div
                            className="h-2 rounded-full bg-brand"
                            style={{ width: `${(r.share / maxShare) * 100}%` }}
                            aria-hidden
                          />
                        </div>
                        <span className="num w-12 text-right text-caption text-fg-secondary">{r.share}%</span>
                      </div>
                    </TD>
                    <TD numeric>{money(r.spend)}</TD>
                    <TD numeric>{r.results}</TD>
                    <TD numeric>{money(r.cpa)}</TD>
                    <TD numeric>{r.ctr == null ? '—' : `${(r.ctr * 100).toFixed(2)}%`}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <p className="mt-2 text-caption text-fg-tertiary">{t('note')}</p>
        </>
      )}
    </>
  );
}
