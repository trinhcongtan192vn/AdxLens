import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { entityNames, funnelAnalysis, type Funnel } from '@adxlens/core/reporting';
import { Card, cn, EmptyState, Table, TBody, TD, TH, THead, TR, tabItemClass, TabBar } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';

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
  const by = (await searchParams).by === 'adset' ? 'adset' : 'campaign';
  const names = await entityNames(pc.ctx, scope.ids, by);
  const data = await funnelAnalysis(pc.ctx, scope.ids, scope.cur, by, names);
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
            {(['campaign', 'adset'] as const).map((k) => (
              <Link
                key={k}
                href={`/w/funnels?by=${k}`}
                role="tab"
                aria-selected={by === k}
                className={tabItemClass(by === k)}
              >
                {t(`by.${k}`)}
              </Link>
            ))}
          </TabBar>
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
          <p className="mt-2 text-caption text-fg-tertiary">{t('landingNote')}</p>
        </>
      )}
    </>
  );
}
