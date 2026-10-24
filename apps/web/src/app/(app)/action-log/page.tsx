import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ClientFilter, clientParam, withClient } from '@/components/client-filter';
import { schema } from '@adxlens/db';
import { listActions } from '@adxlens/core/execution';
import { Badge, Card, cn, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { ACTION_STATUS_TONE, describeChange } from '@/lib/actions';
import { getPageContext, requireFlag } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('actionLog');
  return { title: t('title') };
}

function chip(active: boolean) {
  return cn(
    'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-small font-medium',
    active ? 'border-brand bg-brand-subtle text-brand' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
  );
}

/** P203 Nhật ký hành động (P2-05): mọi thay đổi AdxLens đã làm trên Meta. Sau cờ duyệt hành động. */
export default async function ActionLogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string }>;
}) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2a_approve');
  const t = await getTranslations('actionLog');
  const format = await getFormatter();
  const q = await searchParams;
  const status = (schema.ACTION_STATUSES as readonly string[]).includes(q.status ?? '')
    ? (q.status as (typeof schema.ACTION_STATUSES)[number])
    : undefined;
  const clientId = clientParam(q.client);
  const items = await listActions(pc.ctx, { status, clientId });
  return (
    <>
      <PageHeader title={t('title')} />
      <ClientFilter
        ctx={pc.ctx}
        clientId={clientId}
        clearHref={status ? `/action-log?status=${status}` : '/action-log'}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={withClient('/action-log', clientId)} className={chip(!status)}>
          {t('all')}
        </Link>
        {schema.ACTION_STATUSES.map((s) => (
          <Link key={s} href={withClient(`/action-log?status=${s}`, clientId)} className={chip(status === s)}>
            {t(`status.${s}`)}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{t('cols.when')}</TH>
                <TH>{t('cols.action')}</TH>
                <TH>{t('cols.change')}</TH>
                <TH>{t('cols.by')}</TH>
                <TH>{t('cols.status')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((a) => (
                <TR key={a.id} data-testid="action-row">
                  <TD muted>{format.dateTime(a.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</TD>
                  <TD>
                    <Link href={`/action-log/${a.id}`} className="font-medium text-fg hover:underline">
                      {t(`types.${a.actionType}` as never)}
                    </Link>
                    <span className="block text-small text-fg-secondary">
                      {a.targetName ?? a.targetMetaId} · {a.accountName}
                    </span>
                  </TD>
                  <TD className="num">{describeChange(a, format, { t: (k) => t(k as never) })}</TD>
                  <TD muted>{a.approverName ?? t('system')}</TD>
                  <TD>
                    <Badge tone={ACTION_STATUS_TONE[a.status]}>{t(`status.${a.status}`)}</Badge>
                    {a.undoOf ? <span className="ml-1 text-small text-fg-secondary">{t('isUndo')}</span> : null}
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
