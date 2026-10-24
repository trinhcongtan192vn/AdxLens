import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import type { ActorCtx } from '@adxlens/core/shared';
import { computeMetrics, METRIC_SUMS, metricValues, sumRaw, type MetricRaw, type MetricValues } from './metric-catalog';
import type { DateRange } from './metrics';

export type AmLevel = 'campaign' | 'adset' | 'ad';

export type AmRow = {
  level: AmLevel;
  adAccountId: string;
  metaId: string;
  /** Cấp cha: chiến dịch của nhóm QC, nhóm QC của quảng cáo. */
  parentMetaId: string | null;
  name: string | null;
  status: string | null;
  dailyBudget: string | null;
  metrics: MetricValues;
  prev: MetricValues | null;
  /** Giá trị theo từng ngày của kỳ (sparkline trong ô); null = ngày không có dữ liệu. */
  series: (MetricValues | null)[];
};

export type AdsManagerData = {
  dates: string[];
  rows: AmRow[];
  total: MetricValues;
  totalPrev: MetricValues;
};

function days(range: DateRange): string[] {
  const out: string[] = [];
  const d = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(`${range.to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Ads Manager của Workspace (W7, Madgicx "Ads Manager"): mọi chiến dịch / nhóm QC / quảng cáo với chỉ số kỳ này, kỳ
 * trước và chuỗi theo ngày cho sparkline trong ô; dòng tổng. Dùng chung danh mục chỉ số (`METRIC_SUMS`).
 */
export async function adsManagerData(
  ctx: ActorCtx,
  adAccountIds: string[],
  cur: DateRange,
  prev: DateRange,
): Promise<AdsManagerData> {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  const ids = adAccountIds.filter((id) => allowed.has(id));
  const dates = days(cur);
  const empty = computeMetrics(undefined);
  if (!ids.length) return { dates, rows: [], total: empty, totalPrev: empty };

  const level = async (lvl: AmLevel) => {
    const key = sql.raw(lvl === 'ad' ? 'i.meta_id' : lvl === 'adset' ? 'i.adset_id' : 'i.campaign_id');
    const [daily, prevRows] = await Promise.all([
      ctx.db.execute<MetricRaw & { key: string; date: string; ad_account_id: string }>(sql`
        select i.ad_account_id, ${key} as key, i.date::text as date, ${METRIC_SUMS} from analytics.insights_daily i
        where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids}
          and i.date between ${cur.from} and ${cur.to}
        group by i.ad_account_id, ${key}, i.date`),
      ctx.db.execute<MetricRaw & { key: string; ad_account_id: string }>(sql`
        select i.ad_account_id, ${key} as key, ${METRIC_SUMS} from analytics.insights_daily i
        where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids}
          and i.date between ${prev.from} and ${prev.to}
        group by i.ad_account_id, ${key}`),
    ]);
    const byKey = new Map<string, Map<string, MetricRaw>>();
    for (const r of daily) {
      if (!r.key) continue;
      const k = `${r.ad_account_id}:${r.key}`;
      if (!byKey.has(k)) byKey.set(k, new Map());
      byKey.get(k)!.set(r.date, r);
    }
    const prevBy = new Map(
      prevRows.filter((r) => r.key).map((r) => [`${r.ad_account_id}:${r.key}`, computeMetrics(r)]),
    );
    return { byKey, prevBy };
  };

  const [entities, lc, ls, la, total, totalPrev] = await Promise.all([
    ctx.db.execute<{
      ad_account_id: string;
      entity_type: AmLevel;
      meta_id: string;
      parent_meta_id: string | null;
      name: string | null;
      status: string | null;
      daily_budget: string | null;
    }>(sql`
      select ad_account_id, entity_type, meta_id, parent_meta_id, name, status, daily_budget::text as daily_budget
      from analytics.entities
      where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ids} and entity_type in ('campaign', 'adset', 'ad')`),
    level('campaign'),
    level('adset'),
    level('ad'),
    metricValues(ctx, ids, cur),
    metricValues(ctx, ids, prev),
  ]);
  const data = { campaign: lc, adset: ls, ad: la };
  const rows: AmRow[] = entities.map((e) => {
    const k = `${e.ad_account_id}:${e.meta_id}`;
    const d = data[e.entity_type].byKey.get(k);
    const sum = d ? sumRaw([...d.values()]) : undefined;
    return {
      level: e.entity_type,
      adAccountId: e.ad_account_id,
      metaId: e.meta_id,
      parentMetaId: e.parent_meta_id,
      name: e.name,
      status: e.status,
      dailyBudget: e.daily_budget,
      // Cộng các ngày bằng `sumRaw` (tiền cộng thập phân, không float).
      metrics: sum ? computeMetrics(sum) : empty,
      prev: data[e.entity_type].prevBy.get(k) ?? null,
      series: dates.map((day) => {
        const r = d?.get(day);
        return r ? computeMetrics(r) : null;
      }),
    };
  });
  return { dates, rows, total, totalPrev };
}
