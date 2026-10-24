import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { scaleAnalysis, type FatigueQuadrant } from '@adxlens/core/reporting';
import { Card, cn, EmptyState, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.scale') };
}

const Q_COLOR: Record<FatigueQuadrant, string> = {
  fresh_cheap: 'var(--color-success)',
  burning_out: 'var(--color-danger)',
  expensive_early: 'var(--color-warning)',
  still_holding: 'var(--color-brand)',
};

/**
 * W8 — Mở rộng (Madgicx "Scale"): "Quảng cáo có mệt không?" (tần suất × CPC, kích thước = chi tiêu, 4 góc hành động),
 * tỷ trọng / ROAS theo định dạng, tuổi × giới tính, xu hướng ngày.
 */
export default async function ScalePage() {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsScale');
  const tw = await getTranslations('ws');
  const ta = await getTranslations('wsAds');
  const locale = await getLocale();
  const data = await scaleAnalysis(pc.ctx, scope.ids, scope.cur, scope.prev);
  const money = (v: string | null) => formatMetric('spend', v, scope.currency, locale, { compact: true });
  const { points, freqMid, cpcMid } = data.fatigue;
  const W = 640;
  const H = 320;
  const pad = 40;
  const maxF = Math.max(freqMid * 2, ...points.map((p) => p.frequency), 1);
  const maxC = Math.max(cpcMid * 2, ...points.map((p) => p.cpc), 1);
  const maxS = Math.max(1, ...points.map((p) => Number(p.spend)));
  const x = (f: number) => pad + (f / maxF) * (W - pad * 2);
  const y = (c: number) => H - pad - (c / maxC) * (H - pad * 2);
  const counts = (q: FatigueQuadrant) => points.filter((p) => p.quadrant === q).length;
  const ageGender = data.ageGender;
  const ages = [...new Set(ageGender.map((r) => r.key.split('|')[0]!))].sort();
  const genders = ['female', 'male', 'unknown'].filter((g) => ageGender.some((r) => r.key.endsWith(`|${g}`)));
  const agMax = Math.max(1, ...ageGender.map((r) => Number(r.spend)));
  const trendMax = Math.max(1, ...data.trend.map((d) => Number(d.spend ?? 0)));

  return (
    <>
      <WsHeader
        title={tw('nav.scale')}
        subtitle={t('subtitle')}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      {points.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card data-testid="fatigue-chart">
            <h2 className="text-h4 font-semibold text-fg">{t('fatigue.title')}</h2>
            <p className="text-small text-fg-tertiary">{t('fatigue.intro')}</p>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={t('fatigue.title')}>
              <line
                x1={x(freqMid)}
                x2={x(freqMid)}
                y1={pad / 2}
                y2={H - pad}
                stroke="var(--color-line-strong)"
                strokeDasharray="4 4"
              />
              <line
                x1={pad}
                x2={W - pad / 2}
                y1={y(cpcMid)}
                y2={y(cpcMid)}
                stroke="var(--color-line-strong)"
                strokeDasharray="4 4"
              />
              <line x1={pad} x2={W - pad / 2} y1={H - pad} y2={H - pad} stroke="var(--color-line)" />
              <line x1={pad} x2={pad} y1={pad / 2} y2={H - pad} stroke="var(--color-line)" />
              <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--color-fg-tertiary)">
                {t('fatigue.xAxis')}
              </text>
              <text
                x={12}
                y={H / 2}
                textAnchor="middle"
                fontSize="12"
                fill="var(--color-fg-tertiary)"
                transform={`rotate(-90 12 ${H / 2})`}
              >
                {t('fatigue.yAxis')}
              </text>
              {(
                [
                  ['fresh_cheap', pad + 6, H - pad - 8, 'start'],
                  ['expensive_early', pad + 6, pad / 2 + 12, 'start'],
                  ['burning_out', W - pad / 2 - 6, pad / 2 + 12, 'end'],
                  ['still_holding', W - pad / 2 - 6, H - pad - 8, 'end'],
                ] as const
              ).map(([q, tx, ty, anchor]) => (
                <text key={q} x={tx} y={ty} textAnchor={anchor} fontSize="12" fontWeight="600" fill={Q_COLOR[q]}>
                  {t(`fatigue.q.${q}.title`)}
                </text>
              ))}
              {points.map((p) => (
                <circle
                  key={`${p.adAccountId}:${p.metaId}`}
                  cx={x(p.frequency)}
                  cy={y(p.cpc)}
                  r={4 + Math.sqrt(Number(p.spend) / maxS) * 16}
                  fill={Q_COLOR[p.quadrant]}
                  fillOpacity={0.45}
                  stroke={Q_COLOR[p.quadrant]}
                >
                  <title>{`${p.name ?? p.metaId} · ${t('fatigue.tip', { f: p.frequency.toFixed(2), cpc: money(String(p.cpc)), spend: money(p.spend) })}`}</title>
                </circle>
              ))}
            </svg>
          </Card>
          <Card>
            <h3 className="text-small font-semibold text-fg">{t('fatigue.actions')}</h3>
            <ul className="mt-2 space-y-3">
              {(['fresh_cheap', 'burning_out', 'expensive_early', 'still_holding'] as const).map((q) => (
                <li key={q} className="flex gap-2" data-testid={`quadrant-${q}`}>
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: Q_COLOR[q] }} aria-hidden />
                  <div>
                    <p className="text-small font-medium text-fg">
                      {t(`fatigue.q.${q}.title`)} <span className="num text-fg-tertiary">({counts(q)})</span>
                    </p>
                    <p className="text-caption text-fg-secondary">{t(`fatigue.q.${q}.action`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-caption text-fg-tertiary">
              {t('fatigue.mid', { f: freqMid.toFixed(2), cpc: money(String(cpcMid)) })}
            </p>
            {points.filter((p) => p.quadrant === 'burning_out').length ? (
              <>
                <h4 className="mt-3 text-caption font-semibold text-fg">{t('fatigue.refreshList')}</h4>
                <ul className="mt-1 space-y-1">
                  {points
                    .filter((p) => p.quadrant === 'burning_out')
                    .sort((a, b) => Number(b.spend) - Number(a.spend))
                    .slice(0, 5)
                    .map((p) => (
                      <li key={p.metaId} className="truncate text-caption">
                        <Link href={`/accounts/${p.adAccountId}/ad/${p.metaId}`} className="text-link hover:underline">
                          {p.name ?? p.metaId}
                        </Link>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-h4 font-semibold text-fg">{t('format.title')}</h2>
            <Table className="mt-2">
              <THead>
                <tr>
                  <TH>{t('format.format')}</TH>
                  <TH numeric>{t('format.ads')}</TH>
                  <TH numeric>{t('format.spend')}</TH>
                  <TH numeric>{t('format.share')}</TH>
                  <TH numeric>{t('format.cpa')}</TH>
                  <TH numeric>ROAS</TH>
                </tr>
              </THead>
              <TBody>
                {data.formatMix.map((r) => (
                  <TR key={r.format}>
                    <TD>{ta(`formats.${r.format}`)}</TD>
                    <TD numeric>{r.ads}</TD>
                    <TD numeric>{money(r.spend)}</TD>
                    <TD numeric>{r.share}%</TD>
                    <TD numeric>{money(r.cpa)}</TD>
                    <TD numeric>{r.roas ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <h2 className="text-h4 font-semibold text-fg">{t('ageGender.title')}</h2>
            {ages.length === 0 ? (
              <p className="mt-2 text-small text-fg-secondary">{t('ageGender.none')}</p>
            ) : (
              <table className="mt-2 w-full text-caption">
                <thead>
                  <tr>
                    <th className="text-left font-normal text-fg-tertiary">{t('ageGender.age')}</th>
                    {genders.map((g) => (
                      <th key={g} className="font-normal text-fg-tertiary">
                        {t(`ageGender.g.${g}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ages.map((a) => (
                    <tr key={a}>
                      <td className="py-0.5 text-fg-secondary">{a}</td>
                      {genders.map((g) => {
                        const r = ageGender.find((x) => x.key === `${a}|${g}`);
                        const v = r ? Number(r.spend) / agMax : 0;
                        return (
                          <td key={g} className="p-0.5">
                            <div
                              className={cn(
                                'num rounded px-1 py-0.5 text-center',
                                v > 0.6 ? 'text-on-brand' : 'text-fg',
                              )}
                              style={{
                                background: `color-mix(in srgb, var(--color-brand) ${Math.round(v * 100)}%, transparent)`,
                              }}
                              title={r ? `${money(r.spend)} · CPA ${money(r.cpa)}` : ''}
                            >
                              {r ? money(r.spend) : '—'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="xl:col-span-2">
            <h2 className="text-h4 font-semibold text-fg">{t('trend.title')}</h2>
            <div className="mt-3 flex h-32 items-end gap-1" role="img" aria-label={t('trend.title')}>
              {data.trend.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn('w-full rounded-t', d.hasData ? 'bg-brand' : 'bg-subtle')}
                    style={{ height: `${Math.max(2, (Number(d.spend ?? 0) / trendMax) * 100)}%` }}
                    title={`${d.date}: ${money(d.spend)} · ${d.results ?? 0} ${t('trend.results')}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-caption text-fg-tertiary">
              <span>{data.trend[0]?.date}</span>
              <span>{data.trend[data.trend.length - 1]?.date}</span>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
