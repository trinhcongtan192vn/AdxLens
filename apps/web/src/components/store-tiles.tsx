import { useTranslations } from 'next-intl';
import { compareDecimal, divDecimal } from '@adxlens/core/shared';
import type { StoreSummary } from '@adxlens/core/stores';
import { formatMetric } from '@/lib/metric-format';

/**
 * ADR-0029: ô số liệu cửa hàng / GA4 ở Business Dashboard — doanh thu, số đơn, AOV cửa hàng, MER (doanh thu cửa hàng /
 * chi tiêu QC cùng kỳ, chỉ khi cùng tiền tệ), phiên và chuyển đổi GA4. Số do code tính.
 */
export function StoreTiles({
  summary,
  adSpend,
  adCurrency,
  locale,
}: {
  summary: StoreSummary;
  adSpend: string | null;
  adCurrency: string | null;
  locale: string;
}) {
  const t = useTranslations('stores.tiles');
  const sameCurrency = summary.currency && adCurrency && summary.currency === adCurrency;
  const tiles: { key: string; value: string }[] = [];
  if (summary.revenue !== null) {
    tiles.push({
      key: 'revenue',
      value: formatMetric('spend', summary.revenue, summary.currency, locale, { compact: true }),
    });
  }
  if (summary.orders !== null)
    tiles.push({ key: 'orders', value: formatMetric('purchases', String(summary.orders), null, locale) });
  if (summary.revenue !== null && summary.orders) {
    tiles.push({
      key: 'aov',
      value: formatMetric('spend', divDecimal(summary.revenue, String(summary.orders), 2), summary.currency, locale),
    });
  }
  if (sameCurrency) {
    // Số tiền chia bằng decimal (quy tắc 4), không float.
    const mer =
      summary.revenue && adSpend && compareDecimal(adSpend, '0') > 0 ? divDecimal(summary.revenue, adSpend, 2) : null;
    tiles.push({ key: 'mer', value: mer ? `${mer}×` : '—' });
  }
  if (summary.sessions !== null)
    tiles.push({ key: 'sessions', value: formatMetric('purchases', String(summary.sessions), null, locale) });
  if (summary.conversions !== null) {
    tiles.push({ key: 'conversions', value: formatMetric('purchases', String(summary.conversions), null, locale) });
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="store-tiles">
      {tiles.map((x) => (
        <div key={x.key} className="rounded-lg border border-line bg-subtle p-3">
          <p className="text-caption text-fg-tertiary">{t(x.key)}</p>
          <p className="num mt-1 text-h4 font-semibold text-fg">{x.value}</p>
        </div>
      ))}
    </div>
  );
}
