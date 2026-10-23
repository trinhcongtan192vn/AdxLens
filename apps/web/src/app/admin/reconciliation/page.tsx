import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { reconciliationBoard } from '@adxlens/core/ops';
import { Badge, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { ResyncButton } from '../operations/ops-actions';

export async function generateMetadata() {
  const t = await getTranslations('admin.reconciliation');
  return { title: t('title') };
}

const DAYS = ['7', '30'] as const;

/** Đối chiếu toàn hệ thống (E4 trên giao diện): tài khoản lệch > 1%, bị chặn chia sẻ, đối chiếu trễ. */
export default async function AdminReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; all?: string }>;
}) {
  await requireStaff();
  const t = await getTranslations('admin.reconciliation');
  const format = await getFormatter();
  const sp = await searchParams;
  const days = DAYS.includes(sp.days as (typeof DAYS)[number]) ? Number(sp.days) : 7;
  const all = sp.all === '1';
  const rows = await reconciliationBoard(deps().db, { days, onlyIssues: !all });
  const href = (p: { days?: number; all?: boolean }) =>
    `/admin/reconciliation?days=${p.days ?? days}${(p.all ?? all) ? '&all=1' : ''}`;
  const chip = (on: boolean) =>
    `rounded-md px-2 py-1 text-body ${on ? 'bg-subtle font-medium text-fg' : 'text-fg-secondary hover:text-fg'}`;
  const pct = (v: string | null) => (v === null ? '—' : `${format.number(Number(v), { maximumFractionDigits: 2 })}%`);
  return (
    <>
      <PageHeader title={t('title')} />
      <p className="mb-3 max-w-[820px] text-body text-fg-secondary">{t('body')}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {DAYS.map((d) => (
          <Link key={d} href={href({ days: Number(d) })} className={chip(days === Number(d))}>
            {t('days', { days: d })}
          </Link>
        ))}
        <span className="mx-2 text-fg-tertiary">·</span>
        <Link href={href({ all: false })} className={chip(!all)}>
          {t('onlyIssues')}
        </Link>
        <Link href={href({ all: true })} className={chip(all)}>
          {t('all')}
        </Link>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={all ? t('emptyAll') : t('empty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.workspace')}</TH>
                <TH>{t('cols.account')}</TH>
                <TH numeric>{t('cols.warningDays')}</TH>
                <TH numeric>{t('cols.maxSpend')}</TH>
                <TH numeric>{t('cols.maxResults')}</TH>
                <TH>{t('cols.state')}</TH>
                <TH>{t('cols.lastChecked')}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.adAccountId} data-testid={`recon-row-${r.metaAccountId}`}>
                  <TD>
                    <Link href={`/admin/workspaces/${r.workspaceId}`} className="text-link hover:underline">
                      {r.workspaceName}
                    </Link>
                  </TD>
                  <TD>
                    {r.accountName}
                    <span className="block text-small text-fg-tertiary">
                      {r.clientName ?? t('noClient')} · <span className="font-mono">{r.metaAccountId}</span>
                    </span>
                  </TD>
                  <TD numeric className={r.warningDays ? 'text-danger' : undefined}>
                    {r.warningDays}/{r.daysChecked}
                    {r.warningDates.length ? (
                      <span className="block text-small text-fg-tertiary">{r.warningDates.slice(-3).join(', ')}</span>
                    ) : null}
                  </TD>
                  <TD numeric>{pct(r.maxSpendDeltaPct)}</TD>
                  <TD numeric>{pct(r.maxResultsDeltaPct)}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {r.shareBlocked ? (
                        <Badge tone="danger">{t('blocked')}</Badge>
                      ) : (
                        <Badge tone="success">{t('ok')}</Badge>
                      )}
                      {r.assignmentStatus !== 'confirmed' ? <Badge tone="warning">{t('unconfirmed')}</Badge> : null}
                      {r.stale ? <Badge tone="warning">{t('stale')}</Badge> : null}
                    </div>
                  </TD>
                  <TD muted>
                    {r.lastCheckedAt
                      ? format.dateTime(r.lastCheckedAt, { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </TD>
                  <TD>
                    <ResyncButton adAccountId={r.adAccountId} label={r.accountName} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
