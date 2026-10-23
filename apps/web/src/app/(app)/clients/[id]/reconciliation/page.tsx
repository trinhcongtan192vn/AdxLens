import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getNow, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { can, getClient } from '@adxlens/core/tenancy';
import { listAdAccounts } from '@adxlens/core/connections';
import { reconciliationDetail } from '@adxlens/core/reconciliation';
import { addDays, localDate } from '@adxlens/core/shared';
import {
  Badge,
  Banner,
  Card,
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
import { ReconBadge } from '@/components/recon-badge';
import { metricLabel, recentWarningDates } from '@/lib/recon';
import { getPageContext } from '@/server/page-context';
import { ReconControls } from './recon-controls';

const RANGES = ['7', '14', '30'] as const;

export async function generateMetadata() {
  const t = await getTranslations('recon');
  return { title: t('title') };
}

/** D04 Đối chiếu số liệu (Penpot): AdxLens so với Ads Manager theo chỉ số, khoảng ngày. */
export default async function ReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string; range?: string }>;
}) {
  const pc = await getPageContext();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await getClient(pc.ctx, id).catch(() => null);
  if (!client || client.archivedAt) notFound();
  const sp = await searchParams;
  const t = await getTranslations('recon');
  const tc = await getTranslations('clients');
  const format = await getFormatter();
  const now = await getNow();
  const accounts = await listAdAccounts(pc.ctx, { clientId: client.id });
  const account = accounts.find((a) => a.id === sp.account) ?? accounts[0];
  const range = RANGES.includes(sp.range as (typeof RANGES)[number]) ? (sp.range as (typeof RANGES)[number]) : '7';

  const header = (
    <PageHeader
      breadcrumb={[
        <Link key="c" href="/clients" className="hover:text-fg">
          {tc('backToClients')}
        </Link>,
        <Link key="n" href={`/clients/${client.id}`} className="hover:text-fg">
          {client.name}
        </Link>,
        t('title'),
      ]}
      title={t('title')}
    />
  );
  if (!account) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title={t('noAccounts')} />
        </Card>
      </>
    );
  }

  const yesterday = addDays(localDate(now, account.timezone), -1);
  const from = addDays(yesterday, -(Number(range) - 1));
  const d = await reconciliationDetail(pc.ctx, account.id, { from, to: yesterday });
  const money = (v: string) => format.number(Number(v), { maximumFractionDigits: account.currency === 'VND' ? 0 : 2 });
  const fmt = (key: string, v: string) =>
    key === 'roas'
      ? format.number(Number(v), { maximumFractionDigits: 2 })
      : key === 'spend' || key === 'conversionValue'
        ? money(v)
        : format.number(Number(v));
  const dateLabel = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const recent = recentWarningDates(d.warningDates, yesterday);
  const spendPct = d.metrics.find((m) => m.key === 'spend')?.deltaPct ?? null;

  return (
    <>
      {header}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ReconBadge status={d.status} pct={spendPct} />
        <ReconControls
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          accountId={account.id}
          range={range}
          canResync={can(pc.ctx.actor.role, 'connections.manage')}
          resyncRange={{ from, to: yesterday }}
        />
      </div>
      {d.status === 'warning' ? (
        <Banner tone="warning" className="mb-3">
          {t('warningBanner', { count: d.warningDates.length, dates: d.warningDates.map(dateLabel).join(', ') })}
        </Banner>
      ) : null}
      {d.status === 'pending' ? (
        <Card>
          <EmptyState title={t('title')} description={t('pendingBody')} />
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.metric')}</TH>
                  <TH numeric>{t('cols.adxlens')}</TH>
                  <TH numeric>{t('cols.adsManager')}</TH>
                  <TH numeric>{t('cols.diff')}</TH>
                  <TH numeric>{t('cols.pct')}</TH>
                  <TH>{t('cols.status')}</TH>
                </tr>
              </THead>
              <TBody>
                {d.metrics.map((m) => {
                  const label = metricLabel(m.key);
                  return (
                    <TR key={m.key}>
                      <TD>{t(`metrics.${label.key}`, { currency: account.currency, type: label.type ?? '' })}</TD>
                      <TD numeric>{fmt(m.key, m.internal)}</TD>
                      <TD numeric>{fmt(m.key, m.meta)}</TD>
                      <TD numeric>{fmt(m.key, m.diff)}</TD>
                      <TD numeric>{`${format.number(Number(m.deltaPct), { maximumFractionDigits: 2 })}%`}</TD>
                      <TD>
                        <Badge tone={m.ok ? 'success' : 'warning'}>{m.ok ? t('match') : t('mismatch')}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          {d.status === 'warning' ? (
            <Card className="mt-3 px-4 py-3">
              <p className="text-body font-medium text-fg">{t('causesTitle')}</p>
              <ul className="mt-1 list-disc pl-5 text-body text-fg-secondary">
                {recent.length ? <li>{t('causes.recent', { dates: recent.map(dateLabel).join(', ') })}</li> : null}
                <li>{t('causes.timezone', { timezone: account.timezone })}</li>
                <li>{t('causes.attribution')}</li>
              </ul>
            </Card>
          ) : null}
          <SourceFootnote className="mt-2">
            {t('footnote', {
              time: d.checkedAt ? format.dateTime(d.checkedAt, { hour: '2-digit', minute: '2-digit' }) : '—',
              currency: account.currency,
              timezone: account.timezone,
            })}
          </SourceFootnote>
        </>
      )}
    </>
  );
}
