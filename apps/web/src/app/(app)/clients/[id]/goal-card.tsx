import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ClientGoal, GoalSuggestions } from '@adxlens/core/reporting';
import { vsTarget } from '@adxlens/core/reporting';
import type { MetaAsset } from '@adxlens/core/connections';
import { Badge, buttonVariants, Card, EmptyState } from '@adxlens/ui';
import { formatMetric } from '@/lib/metric-format';

/** Tab "Mục tiêu" của Client (ADR-0017): mục tiêu chính so với 7 ngày qua, chỉ số phụ, ngành, tài sản mặc định. */
export async function GoalCard({
  clientId,
  goal,
  actual,
  assets,
  canManage,
}: {
  clientId: string;
  goal: ClientGoal | null;
  actual: GoalSuggestions;
  assets: MetaAsset[];
  canManage: boolean;
}) {
  const t = await getTranslations('goals');
  const tm = await getTranslations('metrics');
  const ti = await getTranslations('industries');
  const locale = await getLocale();
  const edit = canManage ? (
    <Link href={`/clients/${clientId}/onboarding`} className={buttonVariants({ kind: 'primary', size: 'm' })}>
      {goal?.primaryMetric ? t('tab.edit') : t('bannerCta')}
    </Link>
  ) : null;
  if (!goal?.primaryMetric) {
    return (
      <Card>
        <EmptyState title={t('tab.empty')} description={t('banner')} action={edit} />
      </Card>
    );
  }
  const m = goal.primaryMetric;
  const cur = actual.last7[m];
  const vs = vsTarget(m, cur, goal.primaryTarget);
  const fmt = (k: string, v: string | null) => formatMetric(k, v, goal.currency ?? actual.currency, locale);
  const assetName = (kind: string, id: string | null) =>
    id ? (assets.find((a) => a.kind === kind && a.metaId === id)?.name ?? id) : t('tab.none');
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-small text-fg-tertiary">{t('tab.primary')}</p>
            <p className="text-h3 font-semibold text-fg">{tm(`${m}.name`)}</p>
          </div>
          {edit}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <dt className="text-caption text-fg-tertiary">{t('tab.target')}</dt>
            <dd className="num text-h3 font-semibold text-fg">{fmt(m, goal.primaryTarget)}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-tertiary">{t('tab.actual7')}</dt>
            <dd className="num text-h3 font-semibold text-fg">{fmt(m, cur)}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-tertiary">{t('tab.vs')}</dt>
            <dd className="mt-1">
              {vs == null ? (
                t('tab.none')
              ) : (
                <Badge tone={vs >= 0 ? 'success' : 'danger'}>
                  {t(vs >= 0 ? 'tab.better' : 'tab.worse', { pct: `${Math.abs(vs)}%` })}
                </Badge>
              )}
            </dd>
          </div>
        </dl>
        {goal.secondaryMetrics.length ? (
          <>
            <p className="mt-4 text-small text-fg-tertiary">{t('tab.secondary')}</p>
            <div className="mt-1 grid grid-cols-2 gap-4">
              {goal.secondaryMetrics.map((k) => (
                <div key={k}>
                  <p className="text-small text-fg-secondary">{tm(`${k}.name`)}</p>
                  <p className="num text-body font-semibold text-fg">{fmt(k, actual.last7[k])}</p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Card>
      <Card>
        <p className="text-small text-fg-tertiary">{t('tab.industry')}</p>
        <p className="text-body text-fg">
          {goal.industry
            ? `${ti(`${goal.industry}.name`)}${goal.subIndustry ? ` › ${ti(`${goal.industry}.${goal.subIndustry}`)}` : ''}`
            : t('tab.none')}
        </p>
        <p className="mt-4 text-small text-fg-tertiary">{t('tab.assets')}</p>
        <ul className="text-small text-fg-secondary">
          <li>
            {t('page')}: {assetName('page', goal.defaultPageId)}
          </li>
          <li>
            {t('instagram')}: {assetName('instagram', goal.defaultInstagramId)}
          </li>
          <li>
            {t('pixel')}: {assetName('pixel', goal.defaultPixelId)}
          </li>
        </ul>
      </Card>
    </div>
  );
}
