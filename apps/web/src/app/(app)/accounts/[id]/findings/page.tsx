import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { listFindings, RULES } from '@adxlens/core/insight';
import { Badge, Card, EmptyState, FilterChip, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { FindingDrawer, SEVERITY_TONE } from '@/components/finding-drawer';
import { translateText } from '@/server/translate';
import { loadAccount } from '../load-account';

const SEVERITIES = ['high', 'medium', 'low'] as const;
const STATUSES = ['new', 'seen', 'done', 'dismissed', 'resolved'] as const;

export async function generateMetadata() {
  const t = await getTranslations('findings');
  return { title: t('title') };
}

/** D02 Danh sách phát hiện (lọc mức độ, nhóm, trạng thái); bấm dòng mở D03. */
export default async function FindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ severity?: string; group?: string; status?: string; finding?: string }>;
}) {
  const { pc, account } = await loadAccount((await params).id);
  const sp = await searchParams;
  const t = await getTranslations('findings');
  const tr = await getTranslations('rules');
  const tc = await getTranslations('clients');
  const format = await getFormatter();
  const locale = pc.user.locale === 'en' ? 'en' : 'vi';
  const severity = SEVERITIES.find((s) => s === sp.severity);
  const status = STATUSES.find((s) => s === sp.status);
  const groups = [...new Set(RULES.map((r) => r.group))];
  const group = groups.find((g) => g === sp.group);
  const { items } = await listFindings(pc.ctx, account.id, { severity, status, group, limit: 200 });

  const href = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ severity, status, group, ...next })) if (v) q.set(k, v);
    return `/accounts/${account.id}/findings${q.size ? `?${q}` : ''}`;
  };
  const chip = (active: boolean, label: string, to: string) => (
    <Link key={to + label} href={to}>
      <FilterChip active={active} tabIndex={-1}>
        {label}
      </FilterChip>
    </Link>
  );

  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="c" href="/clients" className="hover:text-fg">
            {tc('backToClients')}
          </Link>,
          <Link key="a" href={`/accounts/${account.id}`} className="hover:text-fg">
            {account.name}
          </Link>,
          t('title'),
        ]}
        title={
          <span className="flex items-center gap-3">
            {t('title')}
            <Badge tone="neutral">{t('count', { count: items.length })}</Badge>
          </span>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2" aria-label={t('filters.severity')}>
        {chip(!severity, t('filters.all'), href({ severity: undefined }))}
        {SEVERITIES.map((s) => chip(severity === s, t(`severity.${s}`), href({ severity: s })))}
        <span className="mx-1 h-4 w-px bg-line" />
        {chip(!status, t('filters.open'), href({ status: undefined }))}
        {STATUSES.map((s) => chip(status === s, t(`status.${s}`), href({ status: s })))}
        <span className="mx-1 h-4 w-px bg-line" />
        {chip(!group, t('filters.all'), href({ group: undefined }))}
        {groups.map((g) => chip(group === g, tr(`groups.${g}`), href({ group: g })))}
      </div>
      <Card>
        {items.length === 0 ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="w-28">{t('cols.severity')}</TH>
                <TH>{t('cols.finding')}</TH>
                <TH>{t('cols.group')}</TH>
                <TH numeric>{t('cols.impact')}</TH>
                <TH>{t('cols.lastSeen')}</TH>
                <TH>{t('cols.status')}</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((f) => (
                <TR key={f.id} selected={sp.finding === f.id}>
                  <TD>
                    <Badge tone={SEVERITY_TONE[f.severity]}>{t(`severity.${f.severity}`)}</Badge>
                  </TD>
                  <TD>
                    <Link
                      href={`${href({})}${href({}).includes('?') ? '&' : '?'}finding=${f.id}`}
                      scroll={false}
                      className="font-medium text-fg hover:text-brand"
                    >
                      {tr.has(`${f.ruleId}.name`) ? tr(`${f.ruleId}.name`) : f.ruleId}
                    </Link>
                    <div className="text-small text-fg-secondary">
                      {t(`entity.${f.entityType}` as never)}: {f.entityName ?? f.metaId} ·{' '}
                      {translateText(locale, f.explanation.why)}
                    </div>
                  </TD>
                  <TD>{tr.has(`groups.${f.ruleGroup}`) ? tr(`groups.${f.ruleGroup}`) : f.ruleGroup}</TD>
                  <TD numeric>
                    {f.impactEstimate
                      ? `${format.number(Number(f.impactEstimate), { maximumFractionDigits: account.currency === 'VND' ? 0 : 2 })} ${account.currency}`
                      : '—'}
                  </TD>
                  <TD muted>{format.dateTime(f.lastSeenAt, { day: '2-digit', month: '2-digit' })}</TD>
                  <TD>
                    <Badge tone="neutral">{t(`status.${f.status}`)}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Suspense>
        <FindingDrawer />
      </Suspense>
    </>
  );
}
