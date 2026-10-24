import { createTranslator } from 'next-intl';
import type { ReportEdits } from '@adxlens/db/schema';
import type { ReportContent } from '@adxlens/core/reporting';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { describeChange } from '@/lib/actions';
import { kpiDelta } from '@/lib/kpi';

/**
 * Mẫu báo cáo (L3 9, L2 6): MỘT mẫu cho xem trước (R03), trang công khai (R06) và PDF A4 (R07). Nhãn theo
 * ngôn ngữ của báo cáo (không theo người xem); số định dạng theo locale đó. Không phụ thuộc client JS.
 */
export function ReportView({
  content,
  edits,
  summary,
  logoUrl,
  showBadge,
}: {
  content: ReportContent;
  edits: ReportEdits;
  summary: string | null;
  logoUrl: string | null;
  showBadge: boolean;
}) {
  const locale = content.locale;
  const messages = locale === 'en' ? en : vi;
  const t = createTranslator({ locale, messages, namespace: 'report' });
  const tr = createTranslator({ locale, messages, namespace: 'rules' });
  const ta = createTranslator({ locale, messages, namespace: 'actionLog' });
  const tAll = createTranslator({ locale, messages, onError: () => {}, getMessageFallback: ({ key }) => key });
  const nf = (v: number, o: Intl.NumberFormatOptions = {}) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', o).format(v);
  const money = (v: string | null, cur: string) =>
    v === null ? '—' : `${nf(Number(v), { maximumFractionDigits: cur === 'VND' ? 0 : 2 })} ${cur}`;
  const date = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return locale === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
  };
  const hidden = new Set(edits.hiddenSections ?? []);
  const color = content.brand.primaryColor ?? '#4F46E5';
  const translateText = (x: { key: string; params?: Record<string, string | number> }) => {
    const key = x.key.replace(/^rules\./, '');
    return tr.has(key as never) ? tr(key as never, x.params as never) : x.key;
  };

  return (
    <article
      className="report mx-auto max-w-[820px] bg-surface text-fg"
      lang={locale}
      style={{ ['--brand' as string]: color }}
    >
      <header className="flex items-start justify-between gap-4 border-b-4 pb-4" style={{ borderColor: color }}>
        <div>
          <p className="text-small font-semibold uppercase tracking-wide" style={{ color }}>
            {t(`kindLabel.${content.kind}`)}
          </p>
          <h1 className="mt-1 text-h1 font-semibold">
            {edits.title || t('preparedFor', { client: content.client.name })}
          </h1>
          <p className="mt-1 text-body text-fg-secondary">
            {t('period', { from: date(content.period.from), to: date(content.period.to) })} ·{' '}
            {t('compare', { from: date(content.compare.from), to: date(content.compare.to) })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {logoUrl ? (
            <img src={logoUrl} alt={content.brand.displayName} className="h-10 max-w-40 object-contain" />
          ) : null}
          <span className="text-small font-medium text-fg-secondary">{content.brand.displayName}</span>
        </div>
      </header>

      {content.demo ? (
        <p
          className="mt-4 rounded-md border border-warning-line bg-warning-bg px-3 py-2 text-body text-warning"
          role="note"
        >
          {t('demo')}
        </p>
      ) : null}

      {summary ? (
        <section className="mt-5">
          <h2 className="text-h3 font-semibold">{t('sections.summary')}</h2>
          <p className="mt-1 whitespace-pre-line text-body">{summary}</p>
        </section>
      ) : null}
      {edits.intro ? (
        <section
          className="mt-4 rounded-md border-l-4 px-3 py-2"
          style={{ borderColor: color }}
          data-testid="report-intro"
        >
          <h2 className="text-h3 font-semibold">{t('sections.intro')}</h2>
          <p className="mt-1 whitespace-pre-line text-body">{edits.intro}</p>
        </section>
      ) : null}

      {content.accounts.map((a) => (
        <section key={a.id} className="mt-6 break-inside-avoid">
          {content.accounts.length > 1 ? (
            <h2 className="text-h2 font-semibold">{t('account', { name: a.name })}</h2>
          ) : null}
          {!hidden.has('kpis') ? (
            <div className="mt-2">
              <h3 className="text-h3 font-semibold">{t('sections.kpis')}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(
                  [
                    ['spend', money(a.kpis.spend, a.currency), a.kpis.spend, a.prevKpis.spend],
                    ['results', nf(a.kpis.results), a.kpis.results, a.prevKpis.results],
                    ['cpa', money(a.kpis.cpa, a.currency), a.kpis.cpa, a.prevKpis.cpa],
                    [
                      'roas',
                      a.kpis.roas === null ? '—' : nf(Number(a.kpis.roas), { maximumFractionDigits: 2 }),
                      a.kpis.roas,
                      a.prevKpis.roas,
                    ],
                    [
                      'ctr',
                      a.kpis.ctr === null ? '—' : nf(a.kpis.ctr, { style: 'percent', maximumFractionDigits: 2 }),
                      a.kpis.ctr,
                      a.prevKpis.ctr,
                    ],
                    ['impressions', nf(a.kpis.impressions), a.kpis.impressions, a.prevKpis.impressions],
                  ] as const
                ).map(([k, shown, cur, prev]) => {
                  const d = kpiDelta(k, cur, prev);
                  return (
                    <div key={k} className="rounded-md border border-line px-3 py-2">
                      <p className="text-caption uppercase text-fg-tertiary">{t(`kpi.${k}`)}</p>
                      <p className="num text-h2 font-semibold">{shown}</p>
                      {d ? (
                        <p
                          className={`num text-small ${d.direction === 'flat' ? 'text-fg-tertiary' : d.good ? 'text-delta-pos' : 'text-delta-neg'}`}
                        >
                          {d.direction === 'up' ? '▲ +' : d.direction === 'down' ? '▼ −' : '– '}
                          {nf(d.pct, { style: 'percent', maximumFractionDigits: 1 })}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!hidden.has('kpis') && a.cpaChange ? (
            <CpaChangeBlock
              x={a.cpaChange}
              currency={a.currency}
              t={(k, v) => t(k as never, v as never)}
              money={money}
              nf={nf}
            />
          ) : null}

          {!hidden.has('trend') ? (
            <div className="mt-4 break-inside-avoid">
              <h3 className="text-h3 font-semibold">{t('sections.trend')}</h3>
              {Number(a.kpis.spend) > 0 ? (
                <SpendBars daily={a.daily} color={color} />
              ) : (
                <p className="text-body text-fg-secondary">{t('noData')}</p>
              )}
            </div>
          ) : null}

          {!hidden.has('campaigns') && a.topCampaigns.length ? (
            <div className="mt-4 break-inside-avoid">
              <h3 className="text-h3 font-semibold">{t('sections.campaigns')}</h3>
              <table className="mt-2 w-full text-small">
                <thead>
                  <tr className="border-b border-line text-left text-fg-tertiary">
                    <th className="py-1 font-medium">{t('cols.campaign')}</th>
                    <th className="py-1 text-right font-medium">{t('cols.spend')}</th>
                    <th className="py-1 text-right font-medium">{t('cols.results')}</th>
                    <th className="py-1 text-right font-medium">{t('cols.cpa')}</th>
                    <th className="py-1 text-right font-medium">{t('cols.roas')}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.topCampaigns.map((c, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="py-1">{c.name}</td>
                      <td className="num py-1 text-right">{money(c.spend, a.currency)}</td>
                      <td className="num py-1 text-right">{nf(c.results)}</td>
                      <td className="num py-1 text-right">{money(c.cpa, a.currency)}</td>
                      <td className="num py-1 text-right">
                        {c.roas === null ? '—' : nf(Number(c.roas), { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!hidden.has('audience') && a.breakdowns && Object.values(a.breakdowns).some((rows) => rows.length) ? (
            <div className="mt-4 break-inside-avoid" data-testid="report-audience">
              <h3 className="text-h3 font-semibold">{t('sections.audience')}</h3>
              <div className="mt-1 grid gap-4 md:grid-cols-3">
                {(['age_gender', 'placement', 'region'] as const).map((b) =>
                  a.breakdowns![b].length ? (
                    <BreakdownList
                      key={b}
                      title={t(`audience.${b}`)}
                      rows={a.breakdowns![b]}
                      label={(k) => breakdownLabel(b, k, (key, v) => t(key as never, v as never))}
                      money={(v) => money(v, a.currency)}
                      nf={nf}
                      t={(k, v) => t(k as never, v as never)}
                    />
                  ) : null,
                )}
              </div>
              <p className="mt-1 text-small text-fg-tertiary">{t('audience.note')}</p>
            </div>
          ) : null}

          {!hidden.has('creatives') && a.topAds?.length ? (
            <div className="mt-4 break-inside-avoid" data-testid="report-creatives">
              <h3 className="text-h3 font-semibold">{t('sections.creatives')}</h3>
              <ul className="mt-2 grid gap-3 sm:grid-cols-5">
                {a.topAds.map((ad) => (
                  <li key={ad.metaId} className="text-small">
                    {ad.thumbnailUrl ? (
                      <img
                        src={ad.thumbnailUrl}
                        alt=""
                        className="aspect-square w-full rounded-md border border-line object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="aspect-square w-full rounded-md border border-line bg-subtle" />
                    )}
                    <p className="mt-1 line-clamp-2 font-medium">{ad.name ?? '—'}</p>
                    <p className="num text-fg-secondary">
                      {money(ad.spend, a.currency)} · {nf(ad.results)} {t('cols.results').toLowerCase()}
                    </p>
                    <p className="num text-fg-tertiary">
                      CPA {money(ad.cpa, a.currency)} · CTR{' '}
                      {ad.ctr === null ? '—' : `${nf(ad.ctr * 100, { maximumFractionDigits: 2 })}%`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ))}

      {!hidden.has('findings') ? (
        <section className="mt-6 break-inside-avoid">
          <h2 className="text-h3 font-semibold">{t('sections.findings')}</h2>
          {content.findings.length ? (
            <ol className="mt-2 space-y-2">
              {content.findings.map((f, i) => (
                <li key={i} className="rounded-md border border-line px-3 py-2">
                  <p className="text-body font-medium">
                    <span
                      className="mr-2 text-small font-semibold uppercase"
                      style={{
                        color: f.severity === 'high' ? '#DC2626' : f.severity === 'medium' ? '#D97706' : '#64748B',
                      }}
                    >
                      {t(`severity.${f.severity}`)}
                    </span>
                    {tr.has(`${f.ruleId}.name` as never) ? tr(`${f.ruleId}.name` as never) : f.ruleId}
                    {f.entityName ? <span className="text-fg-secondary"> · {f.entityName}</span> : null}
                  </p>
                  <p className="mt-0.5 text-small text-fg">{translateText(f.why)}</p>
                  <p className="mt-0.5 text-small text-fg-secondary">{translateText(f.whatToDo)}</p>
                  {f.impact ? (
                    <p className="num mt-0.5 text-small text-fg-secondary">
                      {t('impact', { amount: money(f.impact.amount, f.impact.currency) })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-body text-fg-secondary">{t('noFindings')}</p>
          )}
        </section>
      ) : null}

      {!hidden.has('workDone') && (edits.workDone || content.agencyWork) ? (
        <section className="mt-6 break-inside-avoid" data-testid="report-work-done">
          <h2 className="text-h3 font-semibold">{t('sections.workDone')}</h2>
          {content.agencyWork ? (
            <AgencyWorkList
              work={content.agencyWork}
              accounts={content.accounts}
              t={(k, v) => t(k as never, v as never)}
              actionLabel={(type) => (ta.has(`types.${type}` as never) ? ta(`types.${type}` as never) : type)}
              change={(a) => describeChange(a, { number: nf }, { t: (k) => ta(k as never) })}
              text={(x) => tAll(x.key as never, x.params as never)}
              date={date}
            />
          ) : null}
          {edits.workDone ? <p className="mt-2 whitespace-pre-line text-body">{edits.workDone}</p> : null}
        </section>
      ) : null}
      {!hidden.has('nextSteps') && edits.nextSteps ? (
        <section className="mt-6 break-inside-avoid">
          <h2 className="text-h3 font-semibold">{t('sections.nextSteps')}</h2>
          <p className="mt-1 whitespace-pre-line text-body">{edits.nextSteps}</p>
        </section>
      ) : null}

      <footer className="mt-8 border-t border-line pt-3 text-caption text-fg-tertiary">
        <p>
          {content.source.matchedAt
            ? t('source', {
                matchedAt: new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: content.source.timezones[0] ?? 'Asia/Ho_Chi_Minh',
                }).format(new Date(content.source.matchedAt)),
                currencies: content.source.currencies.join(', '),
                timezones: content.source.timezones.join(', '),
              })
            : t('sourcePending', {
                currencies: content.source.currencies.join(', '),
                timezones: content.source.timezones.join(', '),
              })}
        </p>
        {showBadge ? (
          <p className="mt-1">
            <a href="https://adxlens.com/?utm_source=report_badge" className="hover:underline" rel="noopener">
              {t('poweredBy')}
            </a>
          </p>
        ) : null}
      </footer>
    </article>
  );
}

/** Cột chi tiêu theo ngày bằng SVG thuần (render server, in PDF được). */
function SpendBars({ daily, color }: { daily: { date: string; spend: string }[]; color: string }) {
  const max = Math.max(...daily.map((d) => Number(d.spend)), 1);
  const w = 100 / Math.max(daily.length, 1);
  return (
    <svg viewBox="0 0 100 30" className="mt-2 h-32 w-full" preserveAspectRatio="none" role="img" aria-hidden>
      {daily.map((d, i) => {
        const h = (Number(d.spend) / max) * 28;
        return <rect key={d.date} x={i * w + w * 0.15} y={30 - h} width={w * 0.7} height={h} fill={color} rx={0.4} />;
      })}
    </svg>
  );
}

/** A2: danh sách việc agency đã làm trong kỳ (thay đổi trên Meta đã xác minh, việc đã xong, phát hiện đã xử lý). */
function AgencyWorkList({
  work,
  accounts,
  t,
  actionLabel,
  change,
  text,
  date,
}: {
  work: NonNullable<ReportContent['agencyWork']>;
  accounts: ReportContent['accounts'];
  t: (key: string, values?: Record<string, string | number>) => string;
  actionLabel: (type: string) => string;
  change: (a: NonNullable<ReportContent['agencyWork']>['actions'][number]) => string;
  text: (x: { key: string; params?: Record<string, string | number> }) => string;
  date: (iso: string) => string;
}) {
  const multi = accounts.length > 1;
  const accountName = (id: string) => (multi ? `${accounts.find((a) => a.id === id)?.name ?? ''} · ` : '');
  return (
    <div className="mt-1 text-body">
      <p className="text-fg-secondary">
        {t('work.summary', {
          actions: work.totals.actions,
          tasks: work.totals.tasks,
          findings: work.findingsHandled,
        })}
      </p>
      {work.actions.length ? (
        <>
          <h3 className="mt-3 font-semibold">{t('work.actions')}</h3>
          <ul className="mt-1 space-y-1">
            {work.actions.map((a, i) => (
              <li key={i}>
                <span className="text-fg-tertiary">{date(a.date)}</span> · {accountName(a.accountId)}
                {actionLabel(a.actionType)}
                {a.targetName ? ` "${a.targetName}"` : ''} · <span className="num">{change(a)}</span>
                {a.tier === 'auto' ? ` · ${t('work.auto')}` : ''}
                {a.undone ? ` · ${t('work.undone')}` : ''}
              </li>
            ))}
          </ul>
          {work.totals.actions > work.actions.length ? (
            <p className="text-small text-fg-tertiary">
              {t('work.more', { count: work.totals.actions - work.actions.length })}
            </p>
          ) : null}
        </>
      ) : null}
      {work.tasks.length ? (
        <>
          <h3 className="mt-3 font-semibold">{t('work.tasks')}</h3>
          <ul className="mt-1 space-y-1">
            {work.tasks.map((x, i) => (
              <li key={i}>
                <span className="text-fg-tertiary">{date(x.date)}</span> · {accountName(x.accountId)}
                {text(x.action)}
                {x.entityName ? ` — ${x.entityName}` : ''}
              </li>
            ))}
          </ul>
          {work.totals.tasks > work.tasks.length ? (
            <p className="text-small text-fg-tertiary">
              {t('work.more', { count: work.totals.tasks - work.tasks.length })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** A1: "Vì sao CPA thay đổi?" — yếu tố (CPM / CTR / tỷ lệ chuyển đổi) và chiến dịch đóng góp nhiều nhất. */
export function CpaChangeBlock({
  x,
  currency,
  t,
  money,
  nf,
}: {
  x: NonNullable<ReportContent['accounts'][number]['cpaChange']>;
  currency: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  money: (v: string | null, cur: string) => string;
  nf: (v: number, o?: Intl.NumberFormatOptions) => string;
}) {
  const p = (v: number) => `${v > 0 ? '+' : ''}${nf(v, { maximumFractionDigits: 1 })}%`;
  return (
    <div className="mt-4 break-inside-avoid rounded-md border border-line p-3" data-testid="cpa-change">
      <h3 className="text-h3 font-semibold">{t(x.changePct > 0 ? 'cpa.titleUp' : 'cpa.titleDown')}</h3>
      <p className="mt-1 text-body">
        {t('cpa.headline', {
          previous: money(x.previous, currency),
          current: money(x.current, currency),
          change: p(x.changePct),
        })}
      </p>
      <ul className="mt-2 space-y-1 text-body">
        {x.factors
          .filter((f) => Math.abs(f.sharePct) >= 5)
          .map((f) => (
            <li key={f.key}>
              {t(`cpa.factors.${f.key}`)} <span className="num">{p(f.changePct)}</span> ·{' '}
              <span className="text-fg-secondary">
                {t('cpa.share', { share: nf(f.sharePct, { maximumFractionDigits: 0 }) })}
              </span>
            </li>
          ))}
      </ul>
      {x.drivers.length ? (
        <>
          <p className="mt-2 text-small font-medium text-fg-secondary">{t('cpa.drivers')}</p>
          <ul className="mt-1 space-y-1 text-body">
            {x.drivers.map((d) => (
              <li key={d.metaId}>
                {d.name ?? '—'} · CPA{' '}
                <span className="num">
                  {money(d.previousCpa, currency)} → {money(d.cpa, currency)}
                </span>{' '}
                ·{' '}
                <span className="text-fg-secondary">
                  {t('cpa.share', { share: nf(d.sharePct, { maximumFractionDigits: 0 }) })}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-2 text-small text-fg-tertiary">{t('cpa.method')}</p>
    </div>
  );
}

/** Nhãn nhóm: "25-34|female" → "25–34 · Nữ", "instagram|story" → "Instagram · Story", khu vực giữ nguyên. */
export function breakdownLabel(
  b: 'age_gender' | 'placement' | 'region',
  key: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (b === 'region') return key === 'unknown' ? t('audience.unknown') : key;
  const [x, y] = key.split('|');
  if (b === 'age_gender') {
    const g = y === 'female' ? t('audience.female') : y === 'male' ? t('audience.male') : t('audience.unknown');
    return `${(x ?? '').replace('-', '–')} · ${g}`;
  }
  const cap = (v: string | undefined) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') : '');
  return `${cap(x)} · ${cap(y)}`;
}

/** A4: danh sách theo nhóm (tỷ trọng chi tiêu, kết quả, CPA). */
export function BreakdownList({
  title,
  rows,
  label,
  money,
  nf,
  t,
}: {
  title: string;
  rows: NonNullable<ReportContent['accounts'][number]['breakdowns']>['age_gender'];
  label: (key: string) => string;
  money: (v: string | null) => string;
  nf: (v: number, o?: Intl.NumberFormatOptions) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div>
      <p className="text-small font-semibold text-fg-secondary">{title}</p>
      <table className="mt-1 w-full text-small">
        <thead className="text-fg-tertiary">
          <tr>
            <th className="py-0.5 text-left font-medium">{t('audience.group')}</th>
            <th className="py-0.5 text-right font-medium">{t('audience.share')}</th>
            <th className="py-0.5 text-right font-medium">CPA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-0.5">{label(r.key)}</td>
              <td className="num py-0.5 text-right">{nf(r.share, { maximumFractionDigits: 1 })}%</td>
              <td className="num py-0.5 text-right">{money(r.cpa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
