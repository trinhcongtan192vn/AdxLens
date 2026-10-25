import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { entityNames, funnelAnalysis, landingPages, stageAnalysis, type Funnel } from '@adxlens/core/reporting';
import { Card, cn, EmptyState, Table, TBody, TD, TH, THead, TR, tabItemClass, TabBar } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { StageChart } from './stage-chart';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.funnels') };
}

/** W8 — Phễu Awareness → Consideration → Conversion (Madgicx "Funnels"), theo phạm vi + từng chiến dịch / nhóm QC. */
export default async function FunnelsPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsFunnels');
  const tw = await getTranslations('ws');
  const locale = await getLocale();
  const raw = (await searchParams).by;
  const tab = raw === 'adset' || raw === 'stage' || raw === 'landing' ? raw : 'campaign';
  const by = tab === 'adset' ? 'adset' : 'campaign';
  const names = await entityNames(pc.ctx, scope.ids, by);
  const [data, stages, pages] = await Promise.all([
    funnelAnalysis(pc.ctx, scope.ids, scope.cur, by, names),
    tab === 'stage' ? stageAnalysis(pc.ctx, scope.ids, scope.cur, scope.prev) : Promise.resolve([]),
    tab === 'landing' ? landingPages(pc.ctx, scope.ids, scope.cur) : Promise.resolve([]),
  ]);
  const money = (v: string | null) => formatMetric('spend', v, scope.currency, locale);
  const n = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
  const pct = (v: number | null) =>
    v == null ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v)}%`;
  const stageName = (f: Funnel, k: string) => (k === 'conversions' ? t(`conv.${f.conversionLabel}`) : t(`stages.${k}`));
  const max = Math.max(1, ...data.total.stages.map((s) => s.value));

  return (
    <>
      <WsHeader
        title={tw('nav.funnels')}
        subtitle={t('subtitle')}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      {data.total.stages[0]!.value === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <>
          <Card data-testid="funnel-total">
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${data.total.stages.length}, minmax(0, 1fr))` }}
            >
              {data.total.stages.map((s, i) => (
                <div key={s.key} className="flex flex-col">
                  <p className="text-caption uppercase tracking-wide text-fg-tertiary">
                    {t(
                      `group.${i === 0 ? 'awareness' : i === data.total.stages.length - 1 ? 'conversion' : 'consideration'}`,
                    )}
                  </p>
                  <p className="text-small text-fg-secondary">{stageName(data.total, s.key)}</p>
                  <p className="num text-h2 font-semibold text-fg">{n(s.value)}</p>
                  <div className="mt-2 h-24 rounded-md bg-subtle">
                    <div
                      className="mx-auto rounded-md bg-brand"
                      style={{
                        height: '100%',
                        width: `${Math.max(6, Math.sqrt(s.value / max) * 100)}%`,
                        opacity: 1 - i * 0.18,
                      }}
                      aria-hidden
                    />
                  </div>
                  {i > 0 ? (
                    <p className="mt-1 text-caption text-fg-tertiary">
                      {t('rate', { pct: pct(data.total.rates[i - 1] ?? null) })}
                    </p>
                  ) : (
                    <p className="mt-1 text-caption text-fg-tertiary">&nbsp;</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <TabBar className="mb-3 mt-4">
            {(['campaign', 'adset', 'stage', 'landing'] as const).map((k) => (
              <Link
                key={k}
                href={`/w/funnels?by=${k}`}
                role="tab"
                aria-selected={tab === k}
                className={tabItemClass(tab === k)}
              >
                {t(`by.${k}`)}
              </Link>
            ))}
          </TabBar>
          {tab === 'stage' ? (
            <Card className="overflow-x-auto p-0" data-testid="funnel-stages">
              {stages.length ? (
                <StageChart
                  label={t('stage.chartTitle')}
                  shareLabel={t('share')}
                  roasLabel="ROAS"
                  rows={stages.map((r) => ({
                    stage: r.stage,
                    name: t(`stage.names.${r.stage}`),
                    spendShare: r.spendShare,
                    roas: r.metrics.roas,
                  }))}
                />
              ) : null}
              <Table>
                <THead>
                  <tr>
                    <TH>{t('by.stage')}</TH>
                    <TH className="w-[24%]">{t('share')}</TH>
                    <TH numeric>{t('spend')}</TH>
                    <TH numeric>{t('stage.adsets')}</TH>
                    <TH numeric>{t('stages.conversions')}</TH>
                    <TH numeric>{t('stage.cpa')}</TH>
                    <TH numeric>ROAS</TH>
                  </tr>
                </THead>
                <TBody>
                  {stages.map((r) => (
                    <TR key={r.stage}>
                      <TD>
                        <span className="font-medium text-fg">{t(`stage.names.${r.stage}`)}</span>
                        <span className="block text-caption text-fg-tertiary">{t(`stage.hints.${r.stage}`)}</span>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-subtle">
                            <div
                              className="h-2 rounded-full bg-brand"
                              style={{ width: `${r.spendShare}%` }}
                              aria-hidden
                            />
                          </div>
                          <span className="num w-12 text-right text-caption">{r.spendShare}%</span>
                        </div>
                      </TD>
                      <TD numeric>{money(r.metrics.spend)}</TD>
                      <TD numeric>{r.adsets}</TD>
                      <TD numeric>{n(Number(r.metrics.results ?? 0))}</TD>
                      <TD numeric>{money(r.metrics.cpa)}</TD>
                      <TD numeric>{r.metrics.roas ?? '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <p className="px-3 py-2 text-caption text-fg-tertiary">{t('stage.note')}</p>
            </Card>
          ) : tab === 'landing' ? (
            <Card className="overflow-x-auto p-0" data-testid="funnel-landing">
              {pages.length === 0 ? (
                <EmptyState title={t('landing.emptyTitle')} description={t('landing.emptyBody')} />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>{t('by.landing')}</TH>
                      <TH numeric>{t('landing.ads')}</TH>
                      <TH numeric>{t('spend')}</TH>
                      <TH numeric>{t('stages.link_clicks')}</TH>
                      <TH numeric>{t('clickToConv')}</TH>
                      <TH numeric>{t('stage.cpa')}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {pages.map((p) => (
                      <TR key={p.page}>
                        <TD className="max-w-[360px] truncate font-mono text-caption">{p.page}</TD>
                        <TD numeric>{p.ads}</TD>
                        <TD numeric>{money(p.metrics.spend)}</TD>
                        <TD numeric>{n(Number(p.metrics.link_clicks ?? 0))}</TD>
                        <TD numeric className={cn(p.cvr === 0 ? 'text-danger' : '')}>
                          {pct(p.cvr)}
                        </TD>
                        <TD numeric>{money(p.metrics.cpa)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <Table>
                <THead>
                  <tr>
                    <TH>{t(`by.${by}`)}</TH>
                    <TH numeric>{t('spend')}</TH>
                    <TH numeric>{t('stages.impressions')}</TH>
                    <TH numeric>{t('ctr')}</TH>
                    <TH numeric>{t('stages.link_clicks')}</TH>
                    <TH numeric>{t('clickToConv')}</TH>
                    <TH numeric>{t('stages.conversions')}</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.rows.map((r) => {
                    const s = r.funnel.stages;
                    const conv = s[s.length - 1]!;
                    const clicks = s[1]!.value;
                    return (
                      <TR key={r.metaId}>
                        <TD className="max-w-[320px] truncate">{r.name ?? r.metaId}</TD>
                        <TD numeric>{formatMetric('spend', r.spend, scope.currency, locale)}</TD>
                        <TD numeric>{n(s[0]!.value)}</TD>
                        <TD numeric>{pct(r.funnel.rates[0] ?? null)}</TD>
                        <TD numeric>{n(clicks)}</TD>
                        <TD numeric className={cn(clicks > 0 && conv.value === 0 ? 'text-danger' : '')}>
                          {pct(clicks > 0 ? Math.round((conv.value / clicks) * 10000) / 100 : null)}
                        </TD>
                        <TD numeric>
                          {n(conv.value)}{' '}
                          <span className="text-caption text-fg-tertiary">{t(`conv.${r.funnel.conversionLabel}`)}</span>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
