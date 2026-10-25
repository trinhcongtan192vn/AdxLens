import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import { divDecimal, sumDecimal, type ActorCtx, type WorkspaceCtx } from '@adxlens/core/shared';
import type { DateRange } from './metrics';

/**
 * Danh mục chỉ số dùng chung cho mục tiêu Client (ADR-0017), KPI Home, alert (ADR-0018), lưới Ads. Định nghĩa
 * CPA / ROAS / CPM / CTR giữ nguyên như `toKpis` (quy tắc 4); các chỉ số mới tính từ `actions` đã lưu. Mọi giá trị
 * là chuỗi thập phân (tiền 4 chữ số, tỷ lệ 4 chữ số; CTR theo %), null khi mẫu số = 0.
 */
export const METRIC_KEYS = [
  'spend',
  'impressions',
  'reach',
  'frequency',
  'link_clicks',
  'ctr',
  'cpc',
  'cpm',
  'results',
  'cpa',
  'purchases',
  'cost_per_purchase',
  'purchase_value',
  'roas',
  'leads',
  'cpl',
  'add_to_cart',
  'cost_per_add_to_cart',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export type MetricDef = {
  /** money: theo tiền tệ tài khoản; count: số nguyên; ratio: lần (ROAS, tần suất); percent: % (CTR). */
  kind: 'money' | 'count' | 'ratio' | 'percent';
  /** Hướng tốt: down = càng thấp càng tốt (chi phí). */
  better: 'up' | 'down' | 'neutral';
};

export const METRIC_DEFS: Record<MetricKey, MetricDef> = {
  spend: { kind: 'money', better: 'neutral' },
  impressions: { kind: 'count', better: 'up' },
  reach: { kind: 'count', better: 'up' },
  frequency: { kind: 'ratio', better: 'neutral' },
  link_clicks: { kind: 'count', better: 'up' },
  ctr: { kind: 'percent', better: 'up' },
  cpc: { kind: 'money', better: 'down' },
  cpm: { kind: 'money', better: 'down' },
  results: { kind: 'count', better: 'up' },
  cpa: { kind: 'money', better: 'down' },
  purchases: { kind: 'count', better: 'up' },
  cost_per_purchase: { kind: 'money', better: 'down' },
  purchase_value: { kind: 'money', better: 'up' },
  roas: { kind: 'ratio', better: 'up' },
  leads: { kind: 'count', better: 'up' },
  cpl: { kind: 'money', better: 'down' },
  add_to_cart: { kind: 'count', better: 'up' },
  cost_per_add_to_cart: { kind: 'money', better: 'down' },
};

/** Chỉ số chọn được làm mục tiêu chính / phụ (ADR-0017). */
export const GOAL_METRICS = [
  'cpa',
  'roas',
  'cpl',
  'cpc',
  'cpm',
  'ctr',
  'cost_per_purchase',
  'cost_per_add_to_cart',
  'purchase_value',
] as const satisfies readonly MetricKey[];
export type GoalMetric = (typeof GOAL_METRICS)[number];

/** Action type theo thứ tự ưu tiên; mỗi dòng lấy loại đầu tiên có mặt (tránh đếm trùng purchase / omni_purchase). */
const ACTION_GROUPS = {
  purchases: ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'],
  leads: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  add_to_cart: ['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart', 'omni_add_to_cart'],
} as const;

export type MetricValues = Record<MetricKey, string | null>;

export type MetricRaw = {
  spend: string | null;
  impressions: string | null;
  reach: string | null;
  link_clicks: string | null;
  results: string | null;
  conversion_value: string | null;
  purchases: string | null;
  leads: string | null;
  add_to_cart: string | null;
};

function firstOf(types: readonly string[]) {
  // Biểu thức SQL: giá trị của action_type ưu tiên đầu tiên có trong mảng `actions` của dòng.
  return sql.join(
    [
      sql`coalesce(`,
      sql.join(
        types.map(
          (t) =>
            sql`(select (a->>'value')::numeric from jsonb_array_elements(coalesce(i.actions, '[]'::jsonb)) a where a->>'action_type' = ${t} limit 1)`,
        ),
        sql`, `,
      ),
      sql`, 0)`,
    ],
    sql``,
  );
}

/** Biểu thức SQL tổng thành phần (bảng `analytics.insights_daily` đặt bí danh `i`). */
export const METRIC_SUMS = sql`coalesce(sum(i.spend), 0)::text as spend, coalesce(sum(i.impressions), 0)::text as impressions,
  coalesce(sum(i.reach), 0)::text as reach, coalesce(sum(i.link_clicks), 0)::text as link_clicks,
  coalesce(sum(i.results), 0)::text as results, coalesce(sum(i.conversion_value), 0)::text as conversion_value,
  coalesce(sum(${firstOf(ACTION_GROUPS.purchases)}), 0)::text as purchases,
  coalesce(sum(${firstOf(ACTION_GROUPS.leads)}), 0)::text as leads,
  coalesce(sum(${firstOf(ACTION_GROUPS.add_to_cart)}), 0)::text as add_to_cart`;

const int = (v: string | null | undefined) => String(Math.round(Number(v ?? 0)));

/** Tính mọi chỉ số từ tổng (đã cộng). Thuần, dùng chung cho tổng và từng ngày. */
export function computeMetrics(r: Partial<MetricRaw> | undefined): MetricValues {
  const spend = r?.spend ?? '0';
  const impressions = int(r?.impressions);
  const reach = int(r?.reach);
  const linkClicks = int(r?.link_clicks);
  const results = int(r?.results);
  const value = r?.conversion_value ?? '0';
  const purchases = int(r?.purchases);
  const leads = int(r?.leads);
  const atc = int(r?.add_to_cart);
  const per = (n: string) => (Number(n) > 0 ? divDecimal(spend, n) : null);
  return {
    spend,
    impressions,
    reach,
    frequency: Number(reach) > 0 ? divDecimal(impressions, reach, 2) : null,
    link_clicks: linkClicks,
    ctr: Number(impressions) > 0 ? divDecimal(String(Number(linkClicks) * 100), impressions, 2) : null,
    cpc: per(linkClicks),
    // Như `toKpis`: chia cho số nghìn lượt hiển thị (không nhân tiền với float).
    cpm: Number(impressions) > 0 ? divDecimal(spend, String(Number(impressions) / 1000), 2) : null,
    results,
    cpa: per(results),
    purchases,
    cost_per_purchase: per(purchases),
    purchase_value: value,
    roas: Number(value) > 0 ? divDecimal(value, spend, 2) : null,
    leads,
    cpl: per(leads),
    add_to_cart: atc,
    cost_per_add_to_cart: per(atc),
  };
}

async function visible(ctx: ActorCtx, ids: string[]) {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  return ids.filter((id) => allowed.has(id));
}

/** Tổng chỉ số của các tài khoản (cùng tiền tệ — nơi gọi lọc) trong khoảng ngày. */
export async function metricValues(ctx: ActorCtx, adAccountIds: string[], range: DateRange): Promise<MetricValues> {
  return metricValuesForAccounts(ctx, await visible(ctx, adAccountIds), range);
}

/**
 * Như `metricValues` nhưng KHÔNG lọc theo quyền xem của actor — chỉ dùng trong worker (đánh giá cảnh báo) với id tài
 * khoản đã lấy theo `workspace_id`. Truy vấn vẫn có điều kiện workspace (quy tắc 1).
 */
export async function metricValuesForAccounts(
  ctx: WorkspaceCtx,
  ids: string[],
  range: DateRange,
): Promise<MetricValues> {
  if (!ids.length) return computeMetrics(undefined);
  const [r] = await ctx.db.execute<MetricRaw>(sql`
    select ${METRIC_SUMS} from analytics.insights_daily i
    where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids}
      and i.date between ${range.from} and ${range.to}`);
  return computeMetrics(r);
}

/** Cộng các dòng tổng thành phần (tiền cộng thập phân, số đếm cộng nguyên) — để tính chỉ số của nhiều ngày. */
export function sumRaw(rows: Partial<MetricRaw>[]): MetricRaw {
  const n = (k: keyof MetricRaw) => String(rows.reduce((t, r) => t + Math.round(Number(r[k] ?? 0)), 0));
  return {
    spend: sumDecimal(rows.map((r) => r.spend ?? '0')),
    conversion_value: sumDecimal(rows.map((r) => r.conversion_value ?? '0')),
    impressions: n('impressions'),
    reach: n('reach'),
    link_clicks: n('link_clicks'),
    results: n('results'),
    purchases: n('purchases'),
    leads: n('leads'),
    add_to_cart: n('add_to_cart'),
  };
}

/** Chỉ số theo ngày (sparkline, gợi ý ngưỡng alert). Ngày không có dữ liệu → giá trị rỗng (spend 0). */
export async function metricSeries(
  ctx: ActorCtx,
  adAccountIds: string[],
  range: DateRange,
): Promise<{ date: string; values: MetricValues; hasData: boolean; raw: MetricRaw }[]> {
  const ids = await visible(ctx, adAccountIds);
  if (!ids.length) return [];
  const rows = await ctx.db.execute<MetricRaw & { date: string; n: string }>(sql`
    select d::date::text as date, count(i.meta_id)::text as n, ${METRIC_SUMS}
    from generate_series(${range.from}::date, ${range.to}::date, interval '1 day') d
    left join analytics.insights_daily i
      on i.date = d::date and i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids}
    group by d order by d`);
  return rows.map((r) => ({ date: r.date, values: computeMetrics(r), hasData: Number(r.n) > 0, raw: r }));
}

/** Chỉ số theo từng đối tượng (ad / ad set / campaign) — lưới Ads, Ads Manager. */
export async function entityMetricValues(
  ctx: ActorCtx,
  adAccountIds: string[],
  level: 'campaign' | 'adset' | 'ad',
  range: DateRange,
): Promise<Map<string, MetricValues>> {
  const ids = await visible(ctx, adAccountIds);
  const out = new Map<string, MetricValues>();
  if (!ids.length) return out;
  const key = sql.raw(level === 'ad' ? 'i.meta_id' : level === 'adset' ? 'i.adset_id' : 'i.campaign_id');
  const rows = await ctx.db.execute<MetricRaw & { key: string }>(sql`
    select ${key} as key, ${METRIC_SUMS} from analytics.insights_daily i
    where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids}
      and i.date between ${range.from} and ${range.to}
    group by ${key}`);
  for (const r of rows) if (r.key) out.set(r.key, computeMetrics(r));
  return out;
}

/** % thay đổi (a so với b), 1 chữ số; null khi thiếu số hoặc b = 0. */
export function pctChange(cur: string | null, prev: string | null): number | null {
  if (cur == null || prev == null || Number(prev) === 0) return null;
  return Math.round(((Number(cur) - Number(prev)) / Math.abs(Number(prev))) * 1000) / 10;
}

/** Xu hướng có tốt không theo hướng tốt của chỉ số. */
export function changeIsGood(metric: MetricKey, pct: number | null): boolean | null {
  if (pct == null || pct === 0) return null;
  const b = METRIC_DEFS[metric].better;
  if (b === 'neutral') return null;
  return b === 'up' ? pct > 0 : pct < 0;
}
