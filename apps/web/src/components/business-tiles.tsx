import { BUSINESS_METRICS, type BusinessBlock } from '@adxlens/core/reporting';
import { cn } from '@adxlens/ui';
import { formatMetric, formatPct, LOWER_IS_BETTER } from '@/lib/metric-format';

export const BUSINESS_TILE_KEYS = [...BUSINESS_METRICS, 'aov'] as const;
export type BusinessTileKey = (typeof BUSINESS_TILE_KEYS)[number];
const metricKey = (k: BusinessTileKey) => (k === 'aov' ? 'purchase_value' : k);

/** Ô chỉ số Business Dashboard (giá trị + so kỳ trước, màu theo chiều tốt / xấu). Số do code tính. */
export function BusinessTiles({
  block,
  currency,
  locale,
  label,
  testid,
}: {
  block: BusinessBlock;
  currency: string | null;
  locale: string;
  label: (k: BusinessTileKey) => string;
  testid?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7" data-testid={testid}>
      {BUSINESS_TILE_KEYS.map((k) => {
        const ch = block.changes[k];
        const good = ch == null ? null : LOWER_IS_BETTER.has(metricKey(k)) ? ch < 0 : ch > 0;
        return (
          <div key={k} className="rounded-lg border border-line bg-surface p-3">
            <p className="text-caption text-fg-tertiary">{label(k)}</p>
            <p className="num mt-1 text-h4 font-semibold text-fg">
              {formatMetric(metricKey(k), block.values[k], currency, locale, { compact: true })}
            </p>
            <p
              className={cn(
                'num text-caption',
                good == null ? 'text-fg-tertiary' : good ? 'text-success' : 'text-danger',
              )}
            >
              {formatPct(ch, locale)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
