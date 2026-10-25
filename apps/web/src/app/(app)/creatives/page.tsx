import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ClientFilter, clientParam } from '@/components/client-filter';
import { listAdAccounts } from '@adxlens/core/connections';
import { CREATIVE_CLASSES, creativeLibrary, type CreativeClass } from '@adxlens/core/recommendation';
import { adCopyInsights, creativeFormatTrend, creativeInsights } from '@adxlens/core/reporting';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  cn,
  EmptyState,
  PageHeader,
  Select,
  SourceFootnote,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { CLASS_TONE } from '@/lib/creatives';
import { getPageContext, requireFlag } from '@/server/page-context';
import { currentRanges } from '@/server/period';

export async function generateMetadata() {
  const t = await getTranslations('creatives');
  return { title: t('title') };
}

const KNOWN_FORMATS = new Set(['VIDEO', 'PHOTO', 'SHARE', 'STATUS']);

function chip(active: boolean) {
  return cn(
    'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-small font-medium',
    active ? 'border-brand bg-brand-subtle text-brand' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
  );
}

/**
 * P103 Creative library (P1-01, P1-03, P1-07): creative gom theo creative gốc của một tài khoản, phân loại
 * có lý do, dự báo mệt (ghi rõ là dự báo). Bảng / lưới; chọn 2–4 creative để so sánh (P104).
 * Sau cờ `p1_recommendations` (kiểm ở server).
 */
export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; view?: string; class?: string; client?: string }>;
}) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const t = await getTranslations('creatives');
  const format = await getFormatter();
  const q = await searchParams;
  const clientId = clientParam(q.client);
  const accounts = await listAdAccounts(pc.ctx, { clientId });
  const account = accounts.find((a) => a.id === q.account) ?? accounts[0];
  if (!account) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Card>
          <EmptyState title={t('noAccounts')} description={t('noAccountsBody')} />
        </Card>
      </>
    );
  }
  const view = q.view === 'grid' ? 'grid' : 'table';
  const filter = (CREATIVE_CLASSES as readonly string[]).includes(q.class ?? '') ? (q.class as CreativeClass) : null;
  const { cur } = await currentRanges(account.timezone);
  const all = await creativeLibrary(pc.ctx, account.id, cur);
  const rows = filter ? all.filter((r) => r.class === filter) : all;
  const counts = Object.fromEntries(CREATIVE_CLASSES.map((c) => [c, all.filter((r) => r.class === c).length]));
  // Creative Insights (Madgicx 360° Audit): theo định dạng + ma trận 4 góc, số do code tính.
  const insights = creativeInsights(
    all.map((r) => ({
      key: r.key,
      name: r.name,
      format: r.format,
      spend: r.metrics.spend,
      conversionValue: r.metrics.conversionValue,
      results: r.metrics.results,
      impressions: r.metrics.impressions,
      linkClicks: r.metrics.linkClicks,
    })),
  );
  const ti = await getTranslations('creativeInsights');
  const copy = await adCopyInsights(pc.ctx, [account.id], cur);
  const trend = await creativeFormatTrend(pc.ctx, [account.id], cur.to);
  const trendFormats = [...new Set(trend.flatMap((w) => w.formats.map((f) => f.format)))];
  const tc = await getTranslations('adCopy');
  const money = (v: string | null) =>
    v === null ? '—' : format.number(Number(v), { maximumFractionDigits: account.currency === 'VND' ? 0 : 2 });
  const pct = (v: number | null) =>
    v === null ? '—' : format.number(v, { style: 'percent', maximumFractionDigits: 2 });
  const href = (p: Record<string, string | null>) => {
    const s = new URLSearchParams({
      account: account.id,
      view,
      ...(filter ? { class: filter } : {}),
      ...(clientId ? { client: clientId } : {}),
    });
    for (const [k, v] of Object.entries(p)) {
      if (v === null) s.delete(k);
      else s.set(k, v);
    }
    return `/creatives?${s}`;
  };
  const reason = (r: (typeof rows)[number]) => t(`reasons.${r.reason.key}` as never, r.reason.params as never);
  const thumb = (url: string | null, cls: string) =>
    url ? (
      <img src={url} alt="" className={cn('rounded-md border border-line object-cover', cls)} />
    ) : (
      <span className={cn('rounded-md border border-line bg-subtle', cls)} aria-hidden />
    );

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            {clientId ? <input type="hidden" name="client" value={clientId} /> : null}
            <Select name="account" defaultValue={account.id} aria-label={t('account')} className="w-auto">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Button kind="secondary" size="s" type="submit">
              {t('apply')}
            </Button>
          </form>
        }
      />
      <ClientFilter ctx={pc.ctx} clientId={clientId} clearHref="/creatives" />
      {insights.formats.length ? (
        <div className="mb-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]" data-testid="creative-insights">
          <Card>
            <h2 className="text-h4 font-semibold text-fg">{ti('formatsTitle')}</h2>
            <Table className="mt-2">
              <THead>
                <TR>
                  <TH>{ti('cols.format')}</TH>
                  <TH numeric>{ti('cols.creatives')}</TH>
                  <TH numeric>{ti('cols.spendShare')}</TH>
                  <TH numeric>{ti(insights.valueBasis === 'revenue' ? 'cols.revenueShare' : 'cols.resultsShare')}</TH>
                  <TH numeric>ROAS</TH>
                  <TH numeric>CTR</TH>
                  <TH numeric>CVR</TH>
                </TR>
              </THead>
              <TBody>
                {insights.formats.map((f) => (
                  <TR key={f.format}>
                    <TD>{ti(`formats.${f.format}`)}</TD>
                    <TD numeric>{f.creatives}</TD>
                    <TD numeric>{f.spendShare}%</TD>
                    <TD
                      numeric
                      className={
                        f.valueShare > f.spendShare ? 'text-success' : f.valueShare < f.spendShare ? 'text-danger' : ''
                      }
                    >
                      {f.valueShare}%
                    </TD>
                    <TD numeric>{f.roas ?? '—'}</TD>
                    <TD numeric>{f.ctr == null ? '—' : `${f.ctr}%`}</TD>
                    <TD numeric>{f.cvr == null ? '—' : `${f.cvr}%`}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {insights.missing.length ? (
              <p className="mt-2 text-small text-warning">
                {ti('missing', { formats: insights.missing.map((f) => ti(`formats.${f}`)).join(', ') })}
              </p>
            ) : null}
          </Card>
          <Card>
            <h2 className="text-h4 font-semibold text-fg">{ti('matrixTitle')}</h2>
            <p className="text-caption text-fg-tertiary">
              {ti(insights.valueBasis === 'revenue' ? 'matrixIntro' : 'matrixIntroResults')}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['scalable', 'core', 'getting_started', 'overspend'] as const).map((q) => {
                const list = insights.matrix.filter((m) => m.quadrant === q);
                return (
                  <div key={q} className="rounded-lg border border-line p-2" data-testid={`matrix-${q}`}>
                    <p className="text-small font-semibold text-fg">
                      {ti(`quadrants.${q}.title`)} <span className="num text-fg-tertiary">({list.length})</span>
                    </p>
                    <p className="text-caption text-fg-secondary">{ti(`quadrants.${q}.action`)}</p>
                    <ul className="mt-1 space-y-0.5">
                      {list.slice(0, 3).map((m) => (
                        <li key={m.key} className="truncate text-caption text-fg">
                          {m.name ?? m.key}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}
      {trend.length > 1 ? (
        <Card className="mb-4 overflow-x-auto" data-testid="creative-trend">
          <h2 className="text-h4 font-semibold text-fg">{ti('trendTitle')}</h2>
          <p className="text-caption text-fg-tertiary">{ti('trendIntro')}</p>
          <table className="mt-2 w-full text-caption">
            <thead>
              <tr className="text-fg-tertiary">
                <th className="text-left font-normal">{ti('trendWeek')}</th>
                {trendFormats.map((f) => (
                  <th key={f} className="text-right font-normal">
                    {ti(`formats.${f}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trend.map((w) => (
                <tr key={w.week} className="border-t border-line">
                  <td className="py-1 text-fg">{w.week}</td>
                  {trendFormats.map((f) => {
                    const x = w.formats.find((y) => y.format === f);
                    return (
                      <td key={f} className="num py-1 text-right text-fg">
                        {x ? `${x.spendShare}%` : '—'}
                        {x?.roas ? <span className="ml-1 text-fg-tertiary">· {x.roas}x</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      {copy.copies.length ? (
        <Card className="mb-4" data-testid="ad-copy-insights">
          <h2 className="text-h4 font-semibold text-fg">{tc('title')}</h2>
          <p className="text-caption text-fg-tertiary">{tc('intro')}</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            {(
              [
                ['length', copy.byLength],
                ['emoji', copy.byEmoji],
                ['link', copy.byLink],
              ] as const
            ).map(([k, groups]) => (
              <div key={k}>
                <p className="text-small font-semibold text-fg">{tc(`by.${k}`)}</p>
                <table className="mt-1 w-full text-caption">
                  <thead>
                    <tr className="text-fg-tertiary">
                      <th className="text-left font-normal">{tc('cols.group')}</th>
                      <th className="text-right font-normal">{tc('cols.share')}</th>
                      <th className="text-right font-normal">CTR</th>
                      <th className="text-right font-normal">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.key}>
                        <td className="py-0.5 text-fg">
                          {tc(`groups.${k}.${g.key}`)} <span className="text-fg-tertiary">({g.ads})</span>
                        </td>
                        <td className="num text-right">{g.spendShare}%</td>
                        <td className="num text-right">{g.ctr == null ? '—' : `${g.ctr}%`}</td>
                        <td className="num text-right">{g.roas ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          {copy.topEmojis.length ? (
            <p className="mt-3 text-small text-fg-secondary">
              {tc('topEmojis')}{' '}
              {copy.topEmojis.map((e) => (
                <span key={e.emoji} className="mr-2">
                  {e.emoji} <span className="num text-caption text-fg-tertiary">×{e.ads}</span>
                </span>
              ))}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(['scalable', 'core', 'getting_started', 'overspend'] as const).map((q) => {
              const list = copy.copies.filter((c) => c.quadrant === q);
              return (
                <div key={q} className="rounded-lg border border-line p-2">
                  <p className="text-small font-semibold text-fg">
                    {ti(`quadrants.${q}.title`)} <span className="num text-fg-tertiary">({list.length})</span>
                  </p>
                  <ul className="mt-1 space-y-1">
                    {list.slice(0, 3).map((c) => (
                      <li key={c.body} className="line-clamp-2 text-caption text-fg-secondary" title={c.body}>
                        “{c.body}”
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={href({ class: null })} className={chip(!filter)}>
          {t('all')} · {all.length}
        </Link>
        {CREATIVE_CLASSES.map((c) => (
          <Link key={c} href={href({ class: c })} className={chip(filter === c)}>
            {t(`classes.${c}`)} · {counts[c]}
          </Link>
        ))}
        <div className="flex-1" />
        <Link href={href({ view: 'table' })} className={chip(view === 'table')}>
          {t('viewTable')}
        </Link>
        <Link href={href({ view: 'grid' })} className={chip(view === 'grid')}>
          {t('viewGrid')}
        </Link>
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t('empty')} description={t('emptyBody')} />
        </Card>
      ) : (
        <form method="get" action="/creatives/compare">
          <input type="hidden" name="account" value={account.id} />
          {view === 'table' ? (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-8">
                      <span className="sr-only">{t('select')}</span>
                    </TH>
                    <TH>{t('creative')}</TH>
                    <TH>{t('class')}</TH>
                    <TH numeric>{t('spend')}</TH>
                    <TH numeric>{t('results')}</TH>
                    <TH numeric>{t('cpa')}</TH>
                    <TH numeric>{t('ctr')}</TH>
                    <TH numeric>{t('frequency')}</TH>
                    <TH>{t('runTime')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.key}>
                      <TD>
                        <input
                          type="checkbox"
                          name="ids"
                          value={r.creativeId}
                          aria-label={t('selectOne', { name: r.name ?? r.creativeId })}
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          {thumb(r.thumbnailUrl, 'size-10')}
                          <div>
                            <div className="font-medium text-fg">{r.name ?? r.creativeId}</div>
                            {pc.flags.p2a_approve ? (
                              <a
                                href={`/w/launcher?account=${account.id}&creative=${r.creativeId}`}
                                className="text-caption text-link hover:underline"
                                data-testid="open-in-launcher"
                              >
                                {t('openInLauncher')}
                              </a>
                            ) : null}
                            <div className="text-small text-fg-secondary">
                              {r.format
                                ? KNOWN_FORMATS.has(r.format)
                                  ? t(`formats.${r.format}` as never)
                                  : r.format
                                : '—'}{' '}
                              · {t('ads', { count: r.adCount })}
                            </div>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <div className="flex flex-col gap-1">
                          <Badge tone={CLASS_TONE[r.class]} title={reason(r)} data-testid="creative-class">
                            {t(`classes.${r.class}`)}
                          </Badge>
                          <span className="text-small text-fg-secondary">{reason(r)}</span>
                          {r.forecast ? (
                            <span className="text-small text-warning">{t('forecast', { days: r.forecast.days })}</span>
                          ) : null}
                        </div>
                      </TD>
                      <TD numeric>{money(r.metrics.spend)}</TD>
                      <TD numeric>{format.number(r.metrics.results)}</TD>
                      <TD numeric>{money(r.metrics.cpa)}</TD>
                      <TD numeric>{pct(r.metrics.ctr)}</TD>
                      <TD numeric>
                        {r.metrics.frequency === null
                          ? '—'
                          : format.number(r.metrics.frequency, { maximumFractionDigits: 2 })}
                      </TD>
                      <TD muted>
                        {r.firstDate && r.lastDate ? `${r.firstDate.slice(5)} → ${r.lastDate.slice(5)}` : '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {rows.map((r) => (
                <Card key={r.key} className="flex flex-col gap-2 p-3">
                  {thumb(r.thumbnailUrl, 'aspect-square w-full')}
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name="ids" value={r.creativeId} className="mt-1" />
                    <span className="font-medium text-fg">{r.name ?? r.creativeId}</span>
                  </label>
                  <Badge tone={CLASS_TONE[r.class]} className="self-start">
                    {t(`classes.${r.class}`)}
                  </Badge>
                  <p className="text-small text-fg-secondary">{reason(r)}</p>
                  {r.forecast ? (
                    <p className="text-small text-warning">{t('forecast', { days: r.forecast.days })}</p>
                  ) : null}
                  <p className="num text-small text-fg">
                    {t('spend')}: {money(r.metrics.spend)} · {t('cpa')}: {money(r.metrics.cpa)} · {t('ctr')}:{' '}
                    {pct(r.metrics.ctr)}
                  </p>
                </Card>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className={buttonVariants({ kind: 'primary', size: 'm' })}>
              {t('compare')}
            </button>
            <span className="text-small text-fg-secondary">{t('compareHint')}</span>
          </div>
        </form>
      )}
      <SourceFootnote className="mt-4">{t('footnote', { from: cur.from, to: cur.to })}</SourceFootnote>
    </>
  );
}
