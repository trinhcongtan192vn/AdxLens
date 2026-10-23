import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { executionOverview } from '@adxlens/core/ops';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { AdminAction } from '../admin-action';

export async function generateMetadata() {
  const t = await getTranslations('admin.execution');
  return { title: t('title') };
}

/** Thực thi mọi workspace: số hành động 7 ngày, lỗi gần đây, breaker đang mở (superadmin đóng), rule live. */
export default async function AdminExecutionPage() {
  const { staff } = await requireStaff();
  const t = await getTranslations('admin.execution');
  const format = await getFormatter();
  const o = await executionOverview(deps().db);
  const dt = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const total = (status: string) => o.counts.filter((c) => c.status === status).reduce((n, c) => n + c.n, 0);
  const ws = (id: string, name: string) => (
    <Link href={`/admin/workspaces/${id}`} className="text-link hover:underline">
      {name}
    </Link>
  );
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mb-4 flex flex-wrap gap-2" data-testid="execution-counts">
        {(['success', 'failed', 'pending', 'undone', 'canceled'] as const).map((s) => (
          <Badge key={s} tone={s === 'failed' && total(s) ? 'danger' : 'neutral'}>
            {t(`status.${s}`)}: {total(s)}
          </Badge>
        ))}
        <span className="text-small text-fg-tertiary">{t('last7')}</span>
      </div>

      <Card className="mb-4">
        <CardHeader title={t('breakersTitle', { count: o.breakers.length })} />
        {o.breakers.length === 0 ? (
          <EmptyState title={t('breakersEmpty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.workspace')}</TH>
                <TH>{t('cols.account')}</TH>
                <TH numeric>{t('cols.failures')}</TH>
                <TH>{t('cols.openedAt')}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {o.breakers.map((b) => (
                <TR key={b.adAccountId}>
                  <TD>{ws(b.workspaceId, b.workspaceName)}</TD>
                  <TD>{b.accountName}</TD>
                  <TD numeric>{b.consecutiveFailures}</TD>
                  <TD muted>{dt(b.openedAt)}</TD>
                  <TD>
                    {staff.role === 'superadmin' ? (
                      <AdminAction
                        testId={`close-breaker-${b.adAccountId}`}
                        label={t('closeBreaker')}
                        title={t('closeTitle', { account: b.accountName })}
                        path={`admin/execution/breakers/${b.adAccountId}`}
                        base={{ workspace_id: b.workspaceId }}
                        done={t('closed')}
                        kind="danger"
                      />
                    ) : (
                      <span className="text-small text-fg-tertiary">{t('superOnly')}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('failedTitle')} />
          {o.failed.length === 0 ? (
            <EmptyState title={t('none')} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.workspace')}</TH>
                  <TH>{t('cols.action')}</TH>
                  <TH>{t('cols.result')}</TH>
                </tr>
              </THead>
              <TBody>
                {o.failed.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      {ws(a.workspaceId, a.workspaceName)}
                      <span className="block text-small text-fg-tertiary">{a.accountName}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-small">{a.actionType}</span> · {a.tier}
                      <span className="block text-small text-fg-tertiary">
                        {a.targetName ?? '—'} · {dt(a.createdAt)}
                      </span>
                    </TD>
                    <TD muted className="font-mono text-small">
                      {a.resultCode ?? '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t('liveTitle', { count: o.liveRules.length })} />
          {o.liveRules.length === 0 ? (
            <EmptyState title={t('none')} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.workspace')}</TH>
                  <TH>{t('cols.rule')}</TH>
                  <TH>{t('cols.liveSince')}</TH>
                </tr>
              </THead>
              <TBody>
                {o.liveRules.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      {ws(r.workspaceId, r.workspaceName)}
                      <span className="block text-small text-fg-tertiary">{r.accountName}</span>
                    </TD>
                    <TD>
                      {r.name}
                      <span className="block font-mono text-small text-fg-tertiary">{r.templateKey ?? '—'}</span>
                    </TD>
                    <TD muted>{dt(r.liveSince)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
