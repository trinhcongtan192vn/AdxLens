import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ClientFilter, clientParam } from '@/components/client-filter';
import { listRules } from '@adxlens/core/execution';
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
  const rules = await listRules(pc.ctx, { clientId });
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
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
