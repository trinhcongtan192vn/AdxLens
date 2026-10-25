import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { countryAnalysis, trendingRegions, type TrendRow } from '@adxlens/core/reporting';
import { sumDecimal } from '@adxlens/core/shared';
import { Badge, Banner, Card, EmptyState, Table, TBody, TD, TH, THead, TR, tabItemClass, TabBar } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric, formatPct } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.geography') };
}

/**
 * W8 — Địa lý (Madgicx "Geo & Demo"): tab Khu vực (tỷ trọng, CPA, CTR, wasted spend, đang lên / xuống) và tab Quốc gia
 * (phân tầng Tier 1–4 cho mở rộng quốc tế, quốc gia đang lên). Số do code tính.
 */
export default async function GeographyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === 'country' ? 'country' : 'region';
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsGeo');
  const tw = await getTranslations('ws');
  const locale = await getLocale();
  const money = (v: string | null) => formatMetric('spend', v, scope.currency, locale);
  const [regions, countries] = await Promise.all([
    tab === 'region' ? trendingRegions(pc.ctx, scope.ids, scope.cur, scope.prev) : Promise.resolve([]),
    tab === 'country'
      ? countryAnalysis(pc.ctx, scope.ids, scope.cur, scope.prev)
      : Promise.resolve({ countries: [], tiers: [] }),
  ]);
  const rows: (TrendRow & { tier?: number })[] = tab === 'region' ? regions : countries.countries;
  const wastedSpend = sumDecimal(rows.filter((r) => r.wasted).map((r) => r.spend));
  const maxShare = Math.max(1, ...rows.map((r) => r.share));
  const trendBadge = (r: TrendRow) =>
    r.trend === 'rising' ? (
      <Badge tone="success">{t('trend.rising')}</Badge>
    ) : r.trend === 'falling' ? (
      <Badge tone="neutral">{t('trend.falling')}</Badge>
    ) : r.trend === 'new' ? (
      <Badge tone="info">{t('trend.new')}</Badge>
    ) : null;

  return (
    <>
      <WsHeader
        title={tw('nav.geography')}
        subtitle={t('subtitle')}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      <TabBar className="mb-3" aria-label={t('tabs.label')}>
        {(['region', 'country'] as const).map((k) => (
          <Link
            key={k}
            href={`/w/geography?tab=${k}`}
            role="tab"
            aria-selected={tab === k}
            className={tabItemClass(tab === k)}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </TabBar>
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={tab === 'country' ? t('emptyCountry') : t('emptyBody')} />
        </Card>
      ) : (
        <>
          {Number(wastedSpend) > 0 ? (
            <Banner tone="warning" className="mb-3">
              {t('wasted', { amount: money(wastedSpend), n: rows.filter((r) => r.wasted).length })}
            </Banner>
          ) : null}
          {tab === 'country' ? (
            <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="geo-tiers">
              {countries.tiers.map((x) => (
                <Card key={x.tier}>
                  <p className="text-small font-semibold text-fg">{t('tier', { n: x.tier })}</p>
                  <p className="text-caption text-fg-tertiary">{t(`tierHint.${x.tier}`)}</p>
                  <p className="num mt-2 text-h4 font-semibold text-fg">{money(x.spend)}</p>
                  <p className="text-caption text-fg-secondary">
                    {t('tierLine', { share: `${x.share}%`, n: x.countries, results: x.results })}
                    {x.cpa ? ` · ${t('cpa')} ${money(x.cpa)}` : ''}
                  </p>
                </Card>
              ))}
            </div>
          ) : null}
          <Card className="overflow-x-auto p-0">
            <Table data-testid={tab === 'country' ? 'geo-countries' : 'geo-table'}>
              <THead>
                <tr>
                  <TH>{tab === 'country' ? t('country') : t('region')}</TH>
                  <TH className="w-[26%]">{t('share')}</TH>
                  <TH numeric>{t('spend')}</TH>
                  <TH numeric>{t('vsPrev')}</TH>
                  <TH numeric>{t('results')}</TH>
                  <TH numeric>{t('cpa')}</TH>
                  <TH numeric>{t('ctr')}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.key}>
                    <TD>
                      <span className="mr-1">{r.key === 'unknown' || !r.key ? t('unknown') : r.key}</span>
                      {r.tier ? <Badge tone="neutral">{t('tier', { n: r.tier })}</Badge> : null} {trendBadge(r)}{' '}
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
                    <TD numeric className="text-fg-secondary">
                      {formatPct(r.spendChangePct, locale)}
                    </TD>
                    <TD numeric>{r.results}</TD>
                    <TD numeric>{money(r.cpa)}</TD>
                    <TD numeric>{r.ctr == null ? '—' : `${(r.ctr * 100).toFixed(2)}%`}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <p className="mt-2 text-caption text-fg-tertiary">{tab === 'country' ? t('tierNote') : t('note')}</p>
        </>
      )}
    </>
  );
}
