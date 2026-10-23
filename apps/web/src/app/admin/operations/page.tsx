import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { metaApiUsage, syncIssues } from '@adxlens/core/ops';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { queueAdmin } from '@/server/queue-admin';
import { FailedJobsButton, ResyncButton } from './ops-actions';

export async function generateMetadata() {
  const t = await getTranslations('admin.operations');
  return { title: t('title') };
}

/** Vận hành (staff): đồng bộ lỗi / kẹt, hàng đợi, mức dùng Meta API. Mọi thao tác ghi vào nhật ký admin. */
export default async function AdminOperationsPage() {
  await requireStaff();
  const t = await getTranslations('admin.operations');
  const format = await getFormatter();
  const db = deps().db;
  const [syncs, queues, meta] = await Promise.all([
    syncIssues(db),
    queueAdmin()
      .counts()
      .catch(() => null),
    metaApiUsage(db),
  ]);
  const dt = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: 'short', timeStyle: 'short' }) : '—');

  return (
    <>
      <PageHeader title={t('title')} />

      <Card className="mb-4">
        <CardHeader title={t('syncTitle', { count: syncs.length })} />
        {syncs.length === 0 ? (
          <EmptyState title={t('syncEmpty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.workspace')}</TH>
                <TH>{t('cols.account')}</TH>
                <TH>{t('cols.status')}</TH>
                <TH>{t('cols.range')}</TH>
                <TH>{t('cols.error')}</TH>
                <TH>{t('cols.at')}</TH>
                <TH>{t('cols.actions')}</TH>
              </tr>
            </THead>
            <TBody>
              {syncs.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/admin/workspaces/${s.workspaceId}`} className="text-link hover:underline">
                      {s.workspaceName}
                    </Link>
                  </TD>
                  <TD>
                    {s.accountName}
                    <span className="block font-mono text-small text-fg-tertiary">{s.metaAccountId}</span>
                  </TD>
                  <TD>
                    <Badge tone={s.status === 'failed' ? 'danger' : 'warning'}>
                      {s.status === 'failed' ? t('failed') : t('stuck')}
                    </Badge>{' '}
                    <span className="text-small text-fg-tertiary">{s.kind}</span>
                  </TD>
                  <TD muted>
                    {s.dateFrom} → {s.dateTo}
                  </TD>
                  <TD muted className="font-mono text-small">
                    {s.error ?? '—'}
                  </TD>
                  <TD muted>{dt(s.finishedAt ?? s.startedAt)}</TD>
                  <TD>
                    <ResyncButton adAccountId={s.adAccountId} label={s.accountName} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('queuesTitle')} />
          {queues === null ? (
            <p className="px-4 py-3 text-body text-danger">{t('redisDown')}</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.queue')}</TH>
                  <TH numeric>{t('cols.waiting')}</TH>
                  <TH numeric>{t('cols.active')}</TH>
                  <TH numeric>{t('cols.delayed')}</TH>
                  <TH numeric>{t('cols.failed')}</TH>
                </tr>
              </THead>
              <TBody>
                {queues.map((q) => (
                  <TR key={q.queue} data-testid={`queue-${q.queue}`}>
                    <TD className="font-mono">{q.queue}</TD>
                    <TD numeric className={q.waiting > 100 ? 'text-danger' : undefined}>
                      {q.waiting}
                    </TD>
                    <TD numeric>{q.active}</TD>
                    <TD numeric>{q.delayed}</TD>
                    <TD numeric>
                      <FailedJobsButton queue={q.queue} count={q.failed} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t('metaTitle')} />
          <dl className="grid grid-cols-2 gap-2 px-4 py-3 text-body">
            <dt className="text-fg-secondary">{t('meta.calls')}</dt>
            <dd>{meta.calls}</dd>
            <dt className="text-fg-secondary">{t('meta.errors')}</dt>
            <dd>{meta.errors}</dd>
            <dt className="text-fg-secondary">{t('meta.rateLimited')}</dt>
            <dd className={meta.rateLimited > 0 ? 'text-danger' : undefined}>{meta.rateLimited}</dd>
            <dt className="text-fg-secondary">{t('meta.avgMs')}</dt>
            <dd>{meta.avgMs} ms</dd>
          </dl>
          {meta.top.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{t('cols.workspace')}</TH>
                  <TH numeric>{t('meta.calls')}</TH>
                  <TH numeric>{t('meta.rateLimited')}</TH>
                </tr>
              </THead>
              <TBody>
                {meta.top.map((w) => (
                  <TR key={w.workspaceId ?? 'none'}>
                    <TD>{w.workspaceName ?? t('noWorkspace')}</TD>
                    <TD numeric>{w.calls}</TD>
                    <TD numeric>{w.rateLimited}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : null}
        </Card>
      </div>
    </>
  );
}
