import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ClientFilter, clientParam } from '@/components/client-filter';
import { schema } from '@adxlens/db';
import { listWeeklyActions } from '@adxlens/core/recommendation';
import { can } from '@adxlens/core/tenancy';
import { Card, cn, EmptyState, PageHeader, SourceFootnote } from '@adxlens/ui';
import { getPageContext, requireFlag } from '@/server/page-context';
import { translateText } from '@/server/translate';
import { WeeklyActionsList, type ActionView } from './weekly-actions-list';

export async function generateMetadata() {
  const t = await getTranslations('weekly');
  return { title: t('title') };
}

function chip(active: boolean) {
  return cn(
    'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-small font-medium',
    active ? 'border-brand bg-brand-subtle text-brand' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
  );
}

type Status = (typeof schema.RECOMMENDATION_STATUSES)[number];

/**
 * P101 Weekly Action List (P1-04, P1-05): việc nên làm tuần này, xếp theo điểm ưu tiên (tác động × độ tin cậy
 * ÷ công sức); đổi trạng thái, gán người; P102 chi tiết trong drawer. Sau cờ `p1_recommendations`.
 */
export default async function WeeklyActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; status?: string; mine?: string; client?: string }>;
}) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const t = await getTranslations('weekly');
  const format = await getFormatter();
  const locale = pc.user.locale === 'en' ? 'en' : 'vi';
  const q = await searchParams;
  const status = (schema.RECOMMENDATION_STATUSES as readonly string[]).includes(q.status ?? '')
    ? (q.status as Status)
    : undefined;
  const mine = q.mine === '1';
  const week = q.week && /^\d{4}-\d{2}-\d{2}$/.test(q.week) ? q.week : undefined;
  const clientId = clientParam(q.client);
  const r = await listWeeklyActions(pc.ctx, {
    week,
    status,
    assignee: mine ? pc.actor.userId : undefined,
    clientId,
  });
  const href = (p: { status?: string | null; mine?: boolean; week?: string | null }) => {
    const s = new URLSearchParams();
    const w = p.week === undefined ? r.week : p.week;
    if (w) s.set('week', w);
    const st = p.status === undefined ? status : p.status;
    if (st) s.set('status', st);
    if (p.mine ?? mine) s.set('mine', '1');
    if (clientId) s.set('client', clientId);
    return `/weekly-actions?${s}`;
  };
  const items: ActionView[] = r.items.map((i) => ({
    id: i.id,
    sourceKey: i.sourceKey,
    accountName: i.accountName,
    clientName: i.clientName,
    entityName: i.entityName ?? i.metaId,
    action: translateText(locale, i.action),
    why: translateText(locale, i.why),
    evidence: i.evidence,
    impact:
      i.impactEstimate === null
        ? null
        : format.number(Number(i.impactEstimate), {
            style: 'currency',
            currency: i.currency,
            maximumFractionDigits: i.currency === 'VND' ? 0 : 2,
          }),
    confidence: Number(i.confidence),
    effortMinutes: i.effortMinutes,
    status: i.status,
    skipReason: i.skipReason,
    assigneeId: i.assigneeId,
    assigneeName: i.assigneeName,
    deepLink: typeof i.evidence.deep_link === 'string' ? i.evidence.deep_link : null,
  }));

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          r.weeks.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {r.weeks.slice(0, 4).map((w) => (
                <Link key={w} href={href({ week: w })} className={chip(w === r.week)}>
                  {t('weekOf', {
                    date: format.dateTime(new Date(`${w}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' }),
                  })}
                </Link>
              ))}
            </div>
          ) : null
        }
      />
      <ClientFilter ctx={pc.ctx} clientId={clientId} clearHref="/weekly-actions" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={href({ status: null })} className={chip(!status)}>
          {t('all')}
        </Link>
        {schema.RECOMMENDATION_STATUSES.map((s) => (
          <Link key={s} href={href({ status: s })} className={chip(status === s)}>
            {t(`status.${s}`)}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <Link href={href({ mine: !mine })} className={chip(mine)}>
          {t('mine')}
        </Link>
        <div className="flex-1" />
        <Link href="/weekly-actions/results" className="text-body text-link hover:underline">
          {t('results')}
        </Link>
      </div>
      {!r.week ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title={t('noneFiltered')} description={t('noneFilteredBody')} />
        </Card>
      ) : (
        <WeeklyActionsList
          items={items}
          canUpdate={can(pc.actor.role, 'recommendations.update')}
          canExecute={pc.flags.p2a_approve}
        />
      )}
      <SourceFootnote className="mt-4">{t('footnote')}</SourceFootnote>
    </>
  );
}
