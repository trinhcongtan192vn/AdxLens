import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { listAdAccounts } from '@adxlens/core/connections';
import { compareCreatives } from '@adxlens/core/recommendation';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SourceFootnote,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { CompareChart } from '@/components/compare-chart';
import { CLASS_TONE, parseCompareIds } from '@/lib/creatives';
import { getPageContext, requireFlag } from '@/server/page-context';
import { currentRanges } from '@/server/period';

export async function generateMetadata() {
  const t = await getTranslations('creatives');
  return { title: t('compareTitle') };
}

/** P104 So sánh creative (P1-02): 2–4 creative cùng tài khoản, chỉ số và xu hướng theo ngày. Sau cờ P1. */
export default async function CompareCreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; ids?: string | string[] }>;
}) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const t = await getTranslations('creatives');
  const format = await getFormatter();
  const q = await searchParams;
  const account = (await listAdAccounts(pc.ctx)).find((a) => a.id === q.account);
  if (!account) notFound();
  const ids = parseCompareIds(q.ids);
  const back = (
    <Link href={`/creatives?account=${account.id}`} className="hover:text-fg">
      {t('title')}
    </Link>
  );
  if (ids.length < 2) {
    return (
      <>
        <PageHeader breadcrumb={[back, t('compareTitle')]} title={t('compareTitle')} />
        <Card>
          <EmptyState title={t('compareNeedTwo')} description={t('compareHint')} />
        </Card>
      </>
    );
  }
  const { cur } = await currentRanges(account.timezone);
  const r = await compareCreatives(pc.ctx, account.id, ids, cur);
  const money = (v: string | null) =>
    v === null ? '—' : format.number(Number(v), { maximumFractionDigits: account.currency === 'VND' ? 0 : 2 });
  const pct = (v: number | null) =>
    v === null ? '—' : format.number(v, { style: 'percent', maximumFractionDigits: 2 });
  const names = r.rows.map((x) => ({ key: x.key, name: x.name ?? x.creativeId }));
  const chartData = (pick: (d: { spend: string; ctr: number | null; cpa: string | null }) => number | null) =>
    (r.series[0]?.days ?? []).map((_, i) => {
      const row: Record<string, number | string | null> = { date: r.series[0]!.days[i]!.date };
      for (const s of r.series) row[s.key] = pick(s.days[i]!);
      return row;
    });
  const metricRows: { label: string; cell: (x: (typeof r.rows)[number]) => string }[] = [
    { label: t('spend'), cell: (x) => money(x.metrics.spend) },
    { label: t('results'), cell: (x) => format.number(x.metrics.results) },
    { label: t('cpa'), cell: (x) => money(x.metrics.cpa) },
    { label: t('ctr'), cell: (x) => pct(x.metrics.ctr) },
    { label: t('roas'), cell: (x) => (x.metrics.roas === null ? '—' : format.number(Number(x.metrics.roas))) },
    {
      label: t('frequency'),
      cell: (x) =>
        x.metrics.frequency === null ? '—' : format.number(x.metrics.frequency, { maximumFractionDigits: 2 }),
    },
    { label: t('impressions'), cell: (x) => format.number(x.metrics.impressions) },
  ];

  return (
    <>
      <PageHeader breadcrumb={[back, t('compareTitle')]} title={t('compareTitle')} />
      <Card className="mb-4">
        <Table>
          <THead>
            <TR>
              <TH>{t('metric')}</TH>
              {r.rows.map((x) => (
                <TH key={x.key} numeric>
                  <div className="flex flex-col items-end gap-1">
                    <span>{x.name ?? x.creativeId}</span>
                    <Badge tone={CLASS_TONE[x.class]}>{t(`classes.${x.class}`)}</Badge>
                  </div>
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {metricRows.map((m) => (
              <TR key={m.label}>
                <TD muted>{m.label}</TD>
                {r.rows.map((x) => (
                  <TD key={x.key} numeric>
                    {m.cell(x)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('ctr')} />
          <div className="p-3">
            <CompareChart data={chartData((d) => d.ctr)} series={names} label={t('ctr')} percent />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('spend')} />
          <div className="p-3">
            <CompareChart data={chartData((d) => Number(d.spend))} series={names} label={t('spend')} />
          </div>
        </Card>
      </div>
      <SourceFootnote className="mt-4">{t('footnote', { from: cur.from, to: cur.to })}</SourceFootnote>
    </>
  );
}
