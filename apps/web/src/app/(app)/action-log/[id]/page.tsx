import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getAction } from '@adxlens/core/execution';
import { Badge, Banner, Card, CardHeader, PageHeader } from '@adxlens/ui';
import { ACTION_STATUS_TONE, describeChange } from '@/lib/actions';
import { getPageContext, requireFlag } from '@/server/page-context';
import { UndoButton } from './undo-button';

export async function generateMetadata() {
  const t = await getTranslations('actionLog');
  return { title: t('detailTitle') };
}

/** P204 Chi tiết hành động: trước / sau, ai duyệt, dòng thời gian (nhật ký append-only), hoàn tác. */
export default async function ActionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2a_approve');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const a = await getAction(pc.ctx, id).catch(() => null);
  if (!a) notFound();
  const t = await getTranslations('actionLog');
  const format = await getFormatter();
  const when = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="l" href="/action-log" className="hover:text-fg">
            {t('title')}
          </Link>,
          t('detailTitle'),
        ]}
        title={
          <span className="flex items-center gap-3">
            {t(`types.${a.actionType}` as never)}
            <Badge tone={ACTION_STATUS_TONE[a.status]} data-testid="action-status">
              {t(`status.${a.status}`)}
            </Badge>
          </span>
        }
      />
      {a.status === 'failed' ? (
        <Banner tone="danger" className="mb-4">
          {t('failedBody', { reason: a.errorMessage ?? a.resultCode ?? '' })}
        </Banner>
      ) : null}
      {a.resultCode === 'meta_error_check_manually' ? (
        <Banner tone="warning" className="mb-4">
          {t('checkManually')}
        </Banner>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('summary')} actions={a.undoable ? <UndoButton id={a.id} /> : null} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-4 text-body">
            <dt className="text-fg-secondary">{t('cols.target')}</dt>
            <dd className="text-fg">
              {a.targetName ?? a.targetMetaId} <span className="text-fg-secondary">({a.targetMetaId})</span>
            </dd>
            <dt className="text-fg-secondary">{t('cols.account')}</dt>
            <dd className="text-fg">{a.accountName}</dd>
            <dt className="text-fg-secondary">{t('cols.change')}</dt>
            <dd className="num text-fg">{describeChange(a, format, { t: (k) => t(k as never) })}</dd>
            <dt className="text-fg-secondary">{t('cols.when')}</dt>
            <dd className="text-fg">{when(a.createdAt)}</dd>
            <dt className="text-fg-secondary">{t('cols.executed')}</dt>
            <dd className="text-fg">{when(a.executedAt)}</dd>
            <dt className="text-fg-secondary">{t('cols.verified')}</dt>
            <dd className="text-fg">{when(a.verifiedAt)}</dd>
            {a.undoOf ? (
              <>
                <dt className="text-fg-secondary">{t('undoOf')}</dt>
                <dd>
                  <Link href={`/action-log/${a.undoOf}`} className="text-link hover:underline">
                    {t('viewOriginal')}
                  </Link>
                </dd>
              </>
            ) : null}
            {a.undoAction ? (
              <>
                <dt className="text-fg-secondary">{t('undoneBy')}</dt>
                <dd>
                  <Link href={`/action-log/${a.undoAction.id}`} className="text-link hover:underline">
                    {t(`status.${a.undoAction.status}`)}
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
          {a.actionType === 'duplicate_adset' ? (
            <p className="border-t border-line px-4 py-3 text-small text-fg-secondary">{t('noUndoDuplicate')}</p>
          ) : null}
        </Card>
        <Card>
          <CardHeader title={t('timeline')} />
          <ol className="flex flex-col gap-2 px-4 py-4 text-body" data-testid="action-timeline">
            {a.logs.map((l, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-36 shrink-0 text-small text-fg-secondary">
                  {format.dateTime(l.at, { timeStyle: 'medium' })}
                </span>
                <span className="text-fg">
                  {t.has(`events.${l.event}`) ? t(`events.${l.event}` as never) : l.event}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
