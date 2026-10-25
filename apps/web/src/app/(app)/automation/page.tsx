import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ClientFilter, clientParam } from '@/components/client-filter';
import { listRules } from '@adxlens/core/execution';
import { AUTOMATION_KINDS, automationOverview } from '@adxlens/core/reporting';
import { Badge, buttonVariants, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { MODE_TONE } from '@/lib/automation';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('automation');
  return { title: t('title') };
}

/** P211 Danh sách rule tự động (P2b): chế độ, tài khoản, hành động. Sau cờ tự động hóa. */
export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2b_auto');
  requirePermission(pc, 'automation.manage');
  const t = await getTranslations('automation');
  const ta = await getTranslations('actionLog');
  const format = await getFormatter();
  const clientId = clientParam((await searchParams).client);
  const [rules, overview] = await Promise.all([listRules(pc.ctx, { clientId }), automationOverview(pc.ctx)]);
  const maxDay = Math.max(1, ...overview.daily.map((d) => Object.values(d.counts).reduce((x, y) => x + y, 0)));
  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <span className="flex gap-2">
            <Link href="/automation/results" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
              {t('effectiveness')}
            </Link>
            <Link href="/automation/new" className={buttonVariants({ kind: 'primary', size: 'm' })}>
              {t('new')}
            </Link>
          </span>
        }
      />
      <ClientFilter ctx={pc.ctx} clientId={clientId} clearHref="/automation" />
      {/* Tổng quan 7 ngày (Madgicx Automation Overview): hành động đã kích hoạt theo loại + theo ngày. */}
      <Card className="mb-4" data-testid="automation-overview">
        <h2 className="text-h4 font-semibold text-fg">{t('overview.title')}</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <dl className="grid grid-cols-2 gap-3">
            {AUTOMATION_KINDS.filter((k) => k !== 'other').map((k) => (
              <div key={k} className="rounded-lg bg-subtle px-3 py-2">
                <dt className="text-caption text-fg-tertiary">{t(`overview.kinds.${k}`)}</dt>
                <dd className="num text-h2 font-semibold text-fg">{overview.counts[k]}</dd>
              </div>
            ))}
          </dl>
          <div className="flex h-32 items-end gap-2" role="img" aria-label={t('overview.chart')}>
            {overview.daily.map((d) => {
              const total = Object.values(d.counts).reduce((x, y) => x + y, 0);
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="num text-caption text-fg-tertiary">{total || ''}</span>
                  <div
                    className="w-full rounded-t bg-brand"
                    style={{ height: `${Math.max(2, (total / maxDay) * 96)}px`, opacity: total ? 1 : 0.2 }}
                    title={`${d.date}: ${total}`}
                  />
                  <span className="text-caption text-fg-tertiary">
                    {d.date.slice(8)}/{d.date.slice(5, 7)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      {rules.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{t('cols.name')}</TH>
                <TH>{t('cols.account')}</TH>
                <TH>{t('cols.action')}</TH>
                <TH>{t('cols.mode')}</TH>
                <TH>{t('cols.since')}</TH>
                <TH numeric>{t('overview.cols.last48h')}</TH>
                <TH numeric>{t('overview.cols.last7d')}</TH>
                <TH>{t('overview.cols.lastAt')}</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id} data-testid="rule-row">
                  <TD>
                    <Link href={`/automation/${r.id}`} className="font-medium text-fg hover:underline">
                      {r.name}
                    </Link>
                  </TD>
                  <TD muted>{r.accountName}</TD>
                  <TD muted>
                    {ta(`types.${r.action.type}` as never)}
                    {r.action.changePct ? ` ${r.action.changePct}%` : ''}
                  </TD>
                  <TD>
                    <Badge tone={MODE_TONE[r.mode]}>{t(`modes.${r.mode}`)}</Badge>
                  </TD>
                  <TD muted>
                    {(r.mode === 'live' ? r.liveSince : r.shadowStartedAt)
                      ? format.dateTime((r.mode === 'live' ? r.liveSince : r.shadowStartedAt)!, { dateStyle: 'medium' })
                      : '—'}
                  </TD>
                  <TD numeric>{overview.perRule.get(r.id)?.last48h ?? 0}</TD>
                  <TD numeric>{overview.perRule.get(r.id)?.last7d ?? 0}</TD>
                  <TD muted>
                    {overview.perRule.get(r.id)?.lastAt
                      ? format.dateTime(overview.perRule.get(r.id)!.lastAt!, { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
