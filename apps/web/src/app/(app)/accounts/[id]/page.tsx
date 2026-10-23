import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { healthScores, listFindings } from '@adxlens/core/insight';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import { accountKpis, dailySeries, entityTable, explainCpaChange } from '@adxlens/core/reporting';
import { CpaChangeBlock } from '@/report/report-view';
import {
  Badge,
  buttonVariants,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SourceFootnote,
  Table,
  TBody,
  TD,
  TR,
} from '@adxlens/ui';
import { FindingDrawer, SEVERITY_TONE } from '@/components/finding-drawer';
import { KpiRow } from '@/components/kpi-row';
import { ReconBadge } from '@/components/recon-badge';
import { TrendChart } from '@/components/trend-chart';
import { currentRanges } from '@/server/period';
import { translateText } from '@/server/translate';
import { loadAccount } from './load-account';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { account } = await loadAccount((await params).id);
  return { title: account.name };
}

/** D01 Tổng quan tài khoản quảng cáo: KPI + so sánh kỳ trước, xu hướng, health score, phát hiện nổi bật. */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { pc, account } = await loadAccount((await params).id);
  const t = await getTranslations('account');
  const tf = await getTranslations('findings');
  const tr = await getTranslations('rules');
  const tc = await getTranslations('clients');
  const format = await getFormatter();
  const locale = pc.user.locale === 'en' ? 'en' : 'vi';
  const { cur, prev } = await currentRanges(account.timezone);
  const [kc, kp, series, health, top, recon, campsCur, campsPrev] = await Promise.all([
    accountKpis(pc.ctx, [account.id], cur),
    accountKpis(pc.ctx, [account.id], prev),
    dailySeries(pc.ctx, [account.id], cur),
    healthScores(pc.ctx, [account.id]),
    listFindings(pc.ctx, account.id, { limit: 5 }),
    accountReconciliation(pc.ctx, [account.id]),
    entityTable(pc.ctx, [account.id], 'campaign', cur),
    entityTable(pc.ctx, [account.id], 'campaign', prev),
  ]);
  const h = health.get(account.id)!;
  const r = recon.get(account.id)!;
  const k = kc.get(account.id)!;
  // A1: vì sao CPA thay đổi so với kỳ trước (null khi không đủ dữ liệu hoặc gần như không đổi).
  const cpaChange = explainCpaChange(k, kp.get(account.id)!, { current: campsCur, previous: campsPrev });
  const trep = await getTranslations('report');
  const nf = (v: number, o: Intl.NumberFormatOptions = {}) => format.number(v, o as never);
  const moneyCur = (v: string | null, cur: string) =>
    v === null ? '—' : `${format.number(Number(v), { maximumFractionDigits: cur === 'VND' ? 0 : 2 })} ${cur}`;
  const money = (v: string | null) =>
    v === null ? '—' : format.number(Number(v), { maximumFractionDigits: account.currency === 'VND' ? 0 : 2 });

  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="c" href="/clients" className="hover:text-fg">
            {tc('backToClients')}
          </Link>,
          ...(account.clientId
            ? [
                <Link key="cl" href={`/clients/${account.clientId}`} className="hover:text-fg">
                  {account.clientName}
                </Link>,
              ]
            : []),
          account.name,
        ]}
        title={
          <span className="flex items-center gap-3">
            {account.name}
            {r.status !== 'pending' && account.clientId ? (
              <Link
                href={`/clients/${account.clientId}/reconciliation?account=${account.id}`}
                className="text-body font-normal"
              >
                <ReconBadge status={r.status} pct={r.maxSpendDeltaPct} />
              </Link>
            ) : null}
          </span>
        }
      />
      <KpiRow cur={k} prev={kp.get(account.id)!} currency={account.currency} />
      {cpaChange ? (
        <CpaChangeBlock
          x={cpaChange}
          currency={account.currency}
          t={(key, v) => trep(key as never, v as never)}
          money={moneyCur}
          nf={nf}
        />
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t('trend')} />
          <div className="px-2 py-3">
            {Number(k.spend) > 0 ? (
              <TrendChart
                spendLabel={`${t('spendSeries')} (${account.currency})`}
                resultsLabel={t('resultsSeries')}
                data={series.map((d) => ({ date: d.date, spend: Number(d.spend), results: d.results }))}
              />
            ) : (
              <EmptyState title={t('noData')} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('health')} />
          <div className="px-4 py-3">
            <p className="num text-kpi font-semibold text-fg" data-testid="health-score">
              {h.score}
              <span className="text-body font-normal text-fg-tertiary">/100</span>
            </p>
            {h.components.length ? (
              <ul className="mt-2 space-y-1 text-small">
                {h.components.map((c) => (
                  <li key={c.group} className="flex justify-between gap-2">
                    <span className="text-fg-secondary">
                      {tr.has(`groups.${c.group}`) ? tr(`groups.${c.group}`) : c.group}
                    </span>
                    <span className="num text-fg">{t('healthPenalty', { points: c.penalty, count: c.findings })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-small text-fg-secondary">{t('healthNone')}</p>
            )}
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader
          title={t('topFindings')}
          actions={
            <Link href={`/accounts/${account.id}/findings`} className={buttonVariants({ kind: 'ghost', size: 's' })}>
              {t('allFindings')}
            </Link>
          }
        />
        {top.items.length ? (
          <Table>
            <TBody>
              {top.items.map((f) => (
                <TR key={f.id}>
                  <TD className="w-28">
                    <Badge tone={SEVERITY_TONE[f.severity]}>{tf(`severity.${f.severity}`)}</Badge>
                  </TD>
                  <TD>
                    <Link href={`?finding=${f.id}`} scroll={false} className="font-medium text-fg hover:text-brand">
                      {tr.has(`${f.ruleId}.name`) ? tr(`${f.ruleId}.name`) : f.ruleId}
                    </Link>
                    <div className="text-small text-fg-secondary">{translateText(locale, f.explanation.why)}</div>
                  </TD>
                  <TD numeric>{f.impactEstimate ? `${money(f.impactEstimate)} ${account.currency}` : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title={t('noFindings')} />
        )}
      </Card>
      <SourceFootnote className="mt-2">
        {t('footnote', { from: cur.from, to: cur.to, currency: account.currency, timezone: account.timezone })}
      </SourceFootnote>
      <Suspense>
        <FindingDrawer />
      </Suspense>
    </>
  );
}
