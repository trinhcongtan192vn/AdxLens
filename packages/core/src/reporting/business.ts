import { listAdAccounts } from '@adxlens/core/connections';
import { divDecimal, type ActorCtx } from '@adxlens/core/shared';
import { metricValues, pctChange, type MetricValues } from './metric-catalog';

type DateRange = { from: string; to: string };

/** Chỉ số của Business Dashboard (Madgicx "Blended summary") — đều tính từ snapshot Meta. */
export const BUSINESS_METRICS = ['spend', 'purchase_value', 'roas', 'purchases', 'ctr', 'cpc'] as const;
export type BusinessMetric = (typeof BUSINESS_METRICS)[number] | 'aov';

export type BusinessBlock = {
  values: Record<BusinessMetric, string | null>;
  changes: Record<BusinessMetric, number | null>;
};

/** AOV từ Meta = doanh thu Meta ghi nhận / số mua (không phải AOV của cửa hàng). */
function block(cur: MetricValues, prev: MetricValues): BusinessBlock {
  const aov = (m: MetricValues) =>
    m.purchase_value && m.purchases && Number(m.purchases) > 0 ? divDecimal(m.purchase_value, m.purchases, 2) : null;
  const values = Object.fromEntries(BUSINESS_METRICS.map((k) => [k, cur[k]])) as BusinessBlock['values'];
  values.aov = aov(cur);
  const changes = Object.fromEntries(
    BUSINESS_METRICS.map((k) => [k, pctChange(cur[k], prev[k])]),
  ) as BusinessBlock['changes'];
  changes.aov = pctChange(values.aov, aov(prev));
  return { values, changes };
}

/**
 * Business Dashboard (Madgicx 3.3): tổng hợp các tài khoản cùng tiền tệ chính trong phạm vi + một khối cho từng tài khoản
 * QC người dùng được xem (mỗi khối theo tiền tệ của tài khoản đó). Số do code tính.
 */
export async function businessDashboard(
  ctx: ActorCtx,
  blendedIds: string[],
  cur: DateRange,
  prev: DateRange,
  /** Chỉ các tài khoản này (link công khai theo Client, ADR-0028); mặc định mọi tài khoản người dùng được xem. */
  onlyIds?: string[],
): Promise<{
  blended: BusinessBlock;
  accounts: { id: string; name: string; currency: string; clientName: string | null; block: BusinessBlock }[];
}> {
  const [bc, bp] = await Promise.all([metricValues(ctx, blendedIds, cur), metricValues(ctx, blendedIds, prev)]);
  const all = (await listAdAccounts(ctx)).filter(
    (a) => a.connectionStatus !== 'revoked' && (!onlyIds || onlyIds.includes(a.id)),
  );
  const accounts = await Promise.all(
    all.map(async (a) => {
      const [c, p] = await Promise.all([metricValues(ctx, [a.id], cur), metricValues(ctx, [a.id], prev)]);
      return { id: a.id, name: a.name, currency: a.currency, clientName: a.clientName ?? null, block: block(c, p) };
    }),
  );
  return {
    blended: block(bc, bp),
    accounts: accounts.sort((x, y) => Number(y.block.values.spend ?? 0) - Number(x.block.values.spend ?? 0)),
  };
}
