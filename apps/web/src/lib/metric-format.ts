/**
 * Hiển thị chỉ số trong danh mục core (`METRIC_DEFS`). Chỉ định dạng số đã tính (Number chỉ để hiển thị, không tính
 * tiền ở đây). Không import core để dùng được trong client component.
 */
export type MetricKind = 'money' | 'count' | 'ratio' | 'percent';

export const METRIC_KIND: Record<string, MetricKind> = {
  spend: 'money',
  impressions: 'count',
  reach: 'count',
  frequency: 'ratio',
  link_clicks: 'count',
  ctr: 'percent',
  cpc: 'money',
  cpm: 'money',
  results: 'count',
  cpa: 'money',
  purchases: 'count',
  cost_per_purchase: 'money',
  purchase_value: 'money',
  roas: 'ratio',
  leads: 'count',
  cpl: 'money',
  add_to_cart: 'count',
  cost_per_add_to_cart: 'money',
};

/** Chỉ số càng thấp càng tốt (chi phí). */
export const LOWER_IS_BETTER = new Set(['cpc', 'cpm', 'cpa', 'cost_per_purchase', 'cpl', 'cost_per_add_to_cart']);

export function formatMetric(
  key: string,
  value: string | null | undefined,
  currency: string | null | undefined,
  locale: string,
  opts: { compact?: boolean } = {},
): string {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const kind = METRIC_KIND[key] ?? 'count';
  const compact = opts.compact ? { notation: 'compact' as const, maximumFractionDigits: 1 } : {};
  if (kind === 'money') {
    if (!currency) return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, ...compact }).format(n);
    const zero = ['VND', 'JPY', 'KRW', 'IDR'].includes(currency);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: zero ? 0 : 2,
      ...compact,
    }).format(n);
  }
  if (kind === 'percent') return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)}%`;
  if (kind === 'ratio') return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, ...compact }).format(n);
}

/** % thay đổi hiển thị "+12,5%". */
export function formatPct(p: number | null, locale: string): string {
  if (p == null) return '—';
  const s = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(p);
  return `${s}%`;
}
