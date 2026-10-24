import { redirect } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { agencyOverview, clientsNeedingAttention } from '@adxlens/core/reporting';
import { can } from '@adxlens/core/tenancy';
import {
  Badge,
  Banner,
  buttonVariants,
  Card,
  CardHeader,
  Delta,
  EmptyState,
  KpiStat,
  PageHeader,
  SourceFootnote,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { ReconBadge } from '@/components/recon-badge';
import { kpiDelta } from '@/lib/kpi';
import { worstRecon } from '@/lib/recon';
import { buyerOnboarding } from '@adxlens/core/recommendation';
import { getPageContext } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('overview') };
}

function healthTone(score: number) {
  return score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger';
}

/** O01 Tổng quan agency (PRD P0-11): theo Client và tài khoản, không thống kê theo media buyer. */
export default async function OverviewPage() {
  const pc = await getPageContext();
  // A08 (P1-11): buyer mới vào lần đầu → màn chào mừng theo vai trò (sau cờ Gợi ý).
  if (pc.flags.p1_recommendations && (await buyerOnboarding(pc.ctx))) redirect('/welcome');
  const t = await getTranslations('overview');
  const format = await getFormatter();
  const { clients, unassigned } = await agencyOverview(pc.ctx);
  const attention = await clientsNeedingAttention(pc.ctx, clients);
  const all = [...clients.flatMap((c) => c.accounts), ...unassigned];

  if (!all.length) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Card>
          <EmptyState
            icon={<LayoutDashboard />}
            title={t('emptyTitle')}
            description={t('emptyBody')}
            action={
              can(pc.ctx.actor.role, 'connections.manage') ? (
                <Link href="/connections/new" className={buttonVariants({ kind: 'primary', size: 'm' })}>
                  {t('connect')}
                </Link>
              ) : null
            }
          />
        </Card>
      </>
    );
  }

  const currencies = [...new Set(all.map((a) => a.currency))];
  const sum = (key: 'spend7' | 'spendPrev7' | 'spend30') => all.reduce((s, a) => s + Number(a[key]), 0);
  const money = (amount: string | number, currency: string) =>
    `${format.number(Number(amount), { maximumFractionDigits: currency === 'VND' ? 0 : 2 })} ${currency}`;
  const perCurrency = (m: Record<string, string>) =>
    Object.entries(m)
      .map(([c, v]) => money(v, c))
      .join(' · ') || '—';
  const single = currencies.length === 1 ? currencies[0]! : null;
  const d7 = single ? kpiDelta('spend', sum('spend7'), sum('spendPrev7')) : null;
  const deltaNode = (d: ReturnType<typeof kpiDelta>) =>
    d ? (
      <Delta
        direction={d.direction}
        good={d.good}
        text={format.number(d.pct, { style: 'percent', maximumFractionDigits: 1 })}
      />
    ) : null;

  return (
    <>
      <PageHeader title={t('title')} />
      <Card className="mb-4 flex flex-wrap divide-x divide-line">
        <KpiStat
          label={t('spend7')}
          value={single ? money(sum('spend7'), single) : t('multiCurrency')}
          delta={deltaNode(d7)}
        />
        <KpiStat label={t('spend30')} value={single ? money(sum('spend30'), single) : t('multiCurrency')} />
        <KpiStat label={t('highIssues')} value={format.number(all.reduce((s, a) => s + a.highIssues, 0))} />
        <KpiStat label={t('mismatch')} value={format.number(all.filter((a) => a.recon.status === 'warning').length)} />
      </Card>
      <Card className="mb-4" data-testid="attention">
        <CardHeader title={t('attention.title', { count: attention.length })} />
        {attention.length === 0 ? (
          <p className="px-4 py-3 text-body text-fg-secondary">{t('attention.none')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.clientId} className="flex flex-wrap items-center gap-2 px-4 py-2 text-body">
                <Link href={`/clients/${a.clientId}`} className="min-w-40 font-medium text-fg hover:text-brand">
                  {a.name}
                </Link>
                {a.reasons.map((r) => (
                  <Badge
                    key={r.kind}
                    tone={r.kind === 'recon_warning' || r.kind === 'sync_error' ? 'danger' : 'warning'}
                  >
                    {r.kind === 'recon_warning'
                      ? t('attention.recon', {
                          pct: r.pct === null ? '—' : `${format.number(Number(r.pct), { maximumFractionDigits: 1 })}%`,
                        })
                      : r.kind === 'sync_error'
                        ? t('attention.sync', { count: r.accounts })
                        : r.kind === 'high_issues'
                          ? t('attention.issues', { count: r.count })
                          : r.kind === 'budget'
                            ? t('attention.budget', {
                                status: r.status,
                                pct: format.number(Math.abs(r.pct ?? 0), { maximumFractionDigits: 0 }),
                              })
                            : t('attention.health', { score: r.score })}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {unassigned.length ? (
        <Banner
          tone="warning"
          className="mb-3"
          title={t('unassignedTitle')}
          action={
            can(pc.ctx.actor.role, 'clients.manage') ? (
              <Link href="/connections/assign" className={buttonVariants({ kind: 'secondary', size: 's' })}>
                {t('assign')}
              </Link>
            ) : null
          }
        >
          {t('unassignedBody', { count: unassigned.length })}
        </Banner>
      ) : null}
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>{t('cols.client')}</TH>
              <TH>{t('cols.accounts')}</TH>
              <TH numeric>{t('cols.spend7')}</TH>
              <TH numeric>{t('cols.spend30')}</TH>
              <TH numeric>{t('cols.health')}</TH>
              <TH numeric>{t('cols.highIssues')}</TH>
              <TH>{t('cols.reconciliation')}</TH>
            </tr>
          </THead>
          <TBody>
            {clients.map((c) => {
              const recon = worstRecon(c.accounts.map((a) => a.recon));
              const cur = Object.keys(c.spend7);
              const d = cur.length === 1 ? kpiDelta('spend', c.spend7[cur[0]!]!, c.spendPrev7[cur[0]!]!) : null;
              return (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/clients/${c.id}`} className="font-medium text-fg hover:text-brand">
                      {c.name}
                    </Link>
                  </TD>
                  <TD>
                    <div className="flex flex-col">
                      {c.accounts.map((a) => (
                        <Link
                          key={a.id}
                          href={`/accounts/${a.id}`}
                          className="text-small text-fg-secondary hover:text-brand"
                        >
                          {a.name}
                        </Link>
                      ))}
                    </div>
                  </TD>
                  <TD numeric>
                    <div>{perCurrency(c.spend7)}</div>
                    {deltaNode(d)}
                  </TD>
                  <TD numeric>{perCurrency(c.spend30)}</TD>
                  <TD numeric>{c.health === null ? '—' : <Badge tone={healthTone(c.health)}>{c.health}</Badge>}</TD>
                  <TD numeric>{c.highIssues || '—'}</TD>
                  <TD>
                    {recon.status === 'pending' ? (
                      <span className="text-fg-tertiary">—</span>
                    ) : (
                      <Link href={`/clients/${c.id}/reconciliation`}>
                        <ReconBadge status={recon.status} pct={recon.maxSpendDeltaPct} />
                      </Link>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <SourceFootnote className="mt-2">
        {t('footnote')} {t('healthHint')}
      </SourceFootnote>
    </>
  );
}
