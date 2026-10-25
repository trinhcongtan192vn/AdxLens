import { BellPlus } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { alertSuggestions } from '@adxlens/core/reporting';
import { Card } from '@adxlens/ui';
import { formatMetric } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { CreateAlertButton } from './create-alert-button';

/**
 * Gợi ý cảnh báo từ dữ liệu 30 ngày (Madgicx Home): "CPM 7 ngày dao động X–Y → báo khi vượt Z", tạo 1 click. Số do code
 * tính (ADR-0018).
 */
export async function AlertSuggestions({
  scopeIds,
  currency,
  timezone,
  selectedId,
}: {
  scopeIds: string[];
  currency: string | null;
  timezone: string;
  selectedId: string | null;
}) {
  const pc = await getPageContext();
  const t = await getTranslations('wsHome.suggest');
  const tm = await getTranslations('metrics');
  const locale = await getLocale();
  const list = await alertSuggestions(pc.ctx, scopeIds, timezone);
  const canAll = pc.actor.role !== 'buyer';
  const fmt = (m: string, v: string | null) => formatMetric(m, v, currency, locale);
  return (
    <Card data-testid="ws-alert-suggestions">
      <h2 className="mb-2 flex items-center gap-2 text-h4 font-semibold text-fg">
        <BellPlus className="size-4 text-brand" aria-hidden />
        {t('title')}
      </h2>
      {list.length === 0 ? (
        <p className="text-body text-fg-secondary">{t('none')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s) => (
            <li key={s.metric} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1 text-small">
                <p className="text-fg">
                  {t('range', {
                    metric: tm(`${s.metric}.name`),
                    min: fmt(s.metric, s.min),
                    max: fmt(s.metric, s.max),
                  })}
                </p>
                <p className="text-fg-tertiary">
                  {t(s.condition === 'above' ? 'notifyAbove' : 'notifyBelow', { value: fmt(s.metric, s.threshold) })}
                  {s.current ? ` · ${t('now', { value: fmt(s.metric, s.current) })}` : ''}
                </p>
              </div>
              {selectedId || canAll ? (
                <CreateAlertButton
                  body={{
                    adAccountId: selectedId,
                    metric: s.metric,
                    condition: s.condition,
                    threshold: s.threshold,
                    window: '7d',
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
