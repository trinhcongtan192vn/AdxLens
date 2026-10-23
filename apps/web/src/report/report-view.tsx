import { createTranslator } from 'next-intl';
import type { ReportEdits } from '@adxlens/db/schema';
import type { ReportContent } from '@adxlens/core/reporting';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
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

      {summary ? (
        <section className="mt-5">
          <h2 className="text-h3 font-semibold">{t('sections.summary')}</h2>
          <p className="mt-1 whitespace-pre-line text-body">{summary}</p>
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

      {!hidden.has('workDone') && edits.workDone ? (
        <section className="mt-6 break-inside-avoid">
          <h2 className="text-h3 font-semibold">{t('sections.workDone')}</h2>
          <p className="mt-1 whitespace-pre-line text-body">{edits.workDone}</p>
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
