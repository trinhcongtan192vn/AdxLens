import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import { RULES } from '@adxlens/core/insight';
import { addDays, AppError, compareDecimal, divDecimal, sumDecimal, type ActorCtx } from '@adxlens/core/shared';

export type DateRange = { from: string; to: string };

/** P1-03: nhãn phân loại creative; `insufficient` = chưa đủ dữ liệu để xếp. */
export const CREATIVE_CLASSES = ['winner', 'watch', 'fatigued', 'loser', 'insufficient'] as const;
export type CreativeClass = (typeof CREATIVE_CLASSES)[number];

/**
 * Ngưỡng phân loại (minh bạch, ghi ở `docs/rules/creatives.md`). "Đang mệt" dùng **đúng** ngưỡng của rule
 * `creative_fatigue` (một nguồn duy nhất). Winner/Thua so CPA với trung vị các creative cùng loại kết quả
 * trong cùng tài khoản.
 */
export const CREATIVE_THRESHOLDS = {
  minImpressions: 1000,
  minActiveDays: 3,
  minPeers: 3,
  minPeerResults: 3,
  winnerMinResults: 5,
  winnerCpaRatio: 0.8,
  loserCpaRatio: 1.5,
  loserNoResultSpendRatio: 2,
  forecastHorizonDays: 7,
  forecastMinDays: 10,
  forecastMinDailyImpressions: 200,
} as const;

type FatigueConfig = {
  minActiveDays: number;
  minImpressions: number;
  minBaselineClicks: number;
  minFrequency: number;
  minFrequencyRise: number;
  minCtrDrop: number;
};
export const FATIGUE_CONFIG = RULES.find((r) => r.id === 'creative_fatigue')!.defaults as FatigueConfig;

export type CreativeMetrics = {
  spend: string;
  impressions: number;
  linkClicks: number;
  results: number;
  conversionValue: string;
  activeDays: number;
  ctr: number | null;
  cpa: string | null;
  roas: string | null;
  frequency: number | null;
};

export type CreativeRow = {
  key: string;
  adAccountId: string;
  creativeId: string;
  name: string | null;
  thumbnailUrl: string | null;
  format: string | null;
  adCount: number;
  firstDate: string | null;
  lastDate: string | null;
  resultType: string | null;
  metrics: CreativeMetrics;
  class: CreativeClass;
  reason: { key: string; params: Record<string, string | number> };
  /** P1-07: dự báo (không phải phát hiện) — số ngày tới khi CTR giảm tới ngưỡng mệt. */
  forecast: { days: number } | null;
};

type DayRow = {
  ad_account_id: string;
  creative_id: string;
  date: string;
  spend: string;
  impressions: string;
  link_clicks: string;
  results: string;
  conversion_value: string;
  freq_weighted: string | null;
  result_type: string | null;
};

type Day = {
  date: string;
  spend: string;
  impressions: number;
  linkClicks: number;
  results: number;
  conversionValue: string;
  freqWeighted: number;
  resultType: string | null;
};

function aggregate(days: Day[]): CreativeMetrics {
  const active = days.filter((d) => compareDecimal(d.spend, '0') > 0);
  const spend = sumDecimal(days.map((d) => d.spend));
  const impressions = days.reduce((n, d) => n + d.impressions, 0);
  const linkClicks = days.reduce((n, d) => n + d.linkClicks, 0);
  const results = days.reduce((n, d) => n + d.results, 0);
  const conversionValue = sumDecimal(days.map((d) => d.conversionValue));
  const fw = days.reduce((n, d) => n + d.freqWeighted, 0);
  return {
    spend,
    impressions,
    linkClicks,
    results,
    conversionValue,
    activeDays: active.length,
    ctr: impressions > 0 ? linkClicks / impressions : null,
    cpa: results > 0 ? divDecimal(spend, String(results)) : null,
    roas:
      compareDecimal(conversionValue, '0') > 0 && compareDecimal(spend, '0') > 0
        ? divDecimal(conversionValue, spend, 2)
        : null,
    frequency: impressions > 0 && fw > 0 ? fw / impressions : null,
  };
}

function median(values: string[]): string {
  const s = [...values].sort(compareDecimal);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : divDecimal(sumDecimal([s[mid - 1]!, s[mid]!]), '2')!;
}

const ratio = (a: string, b: string) => Number(a) / Number(b); // tỷ lệ hiển thị/so sánh, không phải tiền

/** "Đang mệt": cùng điều kiện với rule creative_fatigue, so 7 ngày tới `to` với 7 ngày trước đó. */
function fatigue(cur: CreativeMetrics, prev: CreativeMetrics): { ctrDrop: number; freq: number } | null {
  const c = FATIGUE_CONFIG;
  if (cur.activeDays < c.minActiveDays || prev.activeDays < c.minActiveDays) return null;
  if (cur.impressions < c.minImpressions || prev.linkClicks < c.minBaselineClicks) return null;
  if (cur.frequency === null || prev.frequency === null || cur.frequency < c.minFrequency || prev.frequency <= 0)
    return null;
  if (cur.frequency / prev.frequency - 1 < c.minFrequencyRise) return null;
  if (!prev.ctr || cur.ctr === null) return null;
  const ctrDrop = 1 - cur.ctr / prev.ctr;
  return ctrDrop >= c.minCtrDrop ? { ctrDrop, freq: cur.frequency } : null;
}

/**
 * P1-07 dự báo: hồi quy tuyến tính CTR theo ngày trong 14 ngày; nếu đang giảm, số ngày tới khi CTR chạm
 * (1 − ngưỡng giảm của rule mệt) × CTR trung bình 7 ngày đầu. Chỉ trả khi ≤ 7 ngày.
 */
export function fatigueForecast(series: { impressions: number; linkClicks: number }[]): { days: number } | null {
  const T = CREATIVE_THRESHOLDS;
  const pts = series
    .map((d, i) => ({ x: i, y: d.impressions >= T.forecastMinDailyImpressions ? d.linkClicks / d.impressions : null }))
    .filter((p): p is { x: number; y: number } => p.y !== null);
  if (pts.length < T.forecastMinDays) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  if (slope >= 0) return null;
  const first = pts.filter((p) => p.x < 7);
  if (!first.length) return null;
  const baseline = first.reduce((s, p) => s + p.y, 0) / first.length;
  const threshold = baseline * (1 - FATIGUE_CONFIG.minCtrDrop);
  const lastX = series.length - 1;
  const fitted = my + slope * (lastX - mx);
  if (fitted <= threshold) return null; // đã chạm ngưỡng: không còn là dự báo
  const days = Math.ceil((fitted - threshold) / -slope);
  return days > 0 && days <= T.forecastHorizonDays ? { days } : null;
}

async function visibleAccount(ctx: ActorCtx, adAccountId: string) {
  const a = (await listAdAccounts(ctx)).find((x) => x.id === adAccountId);
  if (!a) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  return a;
}

async function loadDays(ctx: ActorCtx, adAccountId: string, from: string, to: string, creativeIds?: string[]) {
  const filter = creativeIds?.length ? sql`and e.attrs->>'creative_id' in ${creativeIds}` : sql``;
  const rows = await ctx.db.execute<DayRow>(sql`
    select i.ad_account_id, e.attrs->>'creative_id' as creative_id, i.date::text as date,
      sum(i.spend)::text as spend, sum(i.impressions)::text as impressions, sum(i.link_clicks)::text as link_clicks,
      sum(i.results)::text as results, coalesce(sum(i.conversion_value), 0)::text as conversion_value,
      sum(coalesce(i.frequency, 0) * i.impressions)::text as freq_weighted,
      min(i.result_type) as result_type
    from analytics.insights_daily i
    join analytics.entities e on e.workspace_id = i.workspace_id and e.ad_account_id = i.ad_account_id
      and e.entity_type = 'ad' and e.meta_id = i.meta_id
    where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id = ${adAccountId} and i.entity_type = 'ad'
      and i.date between ${from} and ${to} and e.attrs->>'creative_id' is not null ${filter}
    group by i.ad_account_id, e.attrs->>'creative_id', i.date
    order by i.date`);
  const by = new Map<string, Day[]>();
  for (const r of rows) {
    const list = by.get(r.creative_id) ?? [];
    list.push({
      date: r.date,
      spend: r.spend,
      impressions: Number(r.impressions),
      linkClicks: Number(r.link_clicks),
      results: Number(r.results),
      conversionValue: r.conversion_value,
      freqWeighted: Number(r.freq_weighted ?? 0),
      resultType: r.result_type,
    });
    by.set(r.creative_id, list);
  }
  return by;
}

async function loadCreatives(ctx: ActorCtx, adAccountId: string) {
  const rows = await ctx.db.execute<{
    meta_id: string;
    name: string | null;
    thumbnail_url: string | null;
    format: string | null;
    ad_count: string;
  }>(sql`
    select c.meta_id, c.name, coalesce(nullif(c.attrs->>'image_url', ''), c.attrs->>'thumbnail_url') as thumbnail_url, c.attrs->>'format' as format,
      (select count(*) from analytics.entities a where a.workspace_id = c.workspace_id
        and a.ad_account_id = c.ad_account_id and a.entity_type = 'ad' and a.attrs->>'creative_id' = c.meta_id)::text as ad_count
    from analytics.entities c
    where c.workspace_id = ${ctx.workspaceId} and c.ad_account_id = ${adAccountId} and c.entity_type = 'creative'`);
  return new Map(rows.map((r) => [r.meta_id, r]));
}

function inRange(days: Day[], from: string, to: string) {
  return days.filter((d) => d.date >= from && d.date <= to);
}

/**
 * P103 Creative library (P1-01, P1-03, P1-07): gom ad theo creative gốc trong một tài khoản, chỉ số trong
 * khoảng ngày, phân loại có lý do, dự báo mệt. Tiền là chuỗi numeric; CTR/tần suất là tỷ lệ.
 */
export async function creativeLibrary(ctx: ActorCtx, adAccountId: string, range: DateRange): Promise<CreativeRow[]> {
  await visibleAccount(ctx, adAccountId);
  const T = CREATIVE_THRESHOLDS;
  const histFrom = [range.from, addDays(range.to, -13)].sort()[0]!;
  const [days, meta] = await Promise.all([
    loadDays(ctx, adAccountId, histFrom, range.to),
    loadCreatives(ctx, adAccountId),
  ]);
  const curFrom = addDays(range.to, -6);
  const prevFrom = addDays(range.to, -13);
  const prevTo = addDays(range.to, -7);

  const base = [...days.entries()].map(([creativeId, all]) => {
    const window = inRange(all, range.from, range.to);
    const m = aggregate(window);
    const types = window.map((d) => d.resultType).filter((x): x is string => !!x);
    const series14: { impressions: number; linkClicks: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = addDays(range.to, -i);
      const d = all.find((x) => x.date === date);
      series14.push({ impressions: d?.impressions ?? 0, linkClicks: d?.linkClicks ?? 0 });
    }
    const info = meta.get(creativeId);
    const withSpend = window.filter((d) => compareDecimal(d.spend, '0') > 0);
    return {
      creativeId,
      info,
      m,
      resultType: types[0] ?? null,
      firstDate: withSpend[0]?.date ?? null,
      lastDate: withSpend.at(-1)?.date ?? null,
      fatigue: fatigue(aggregate(inRange(all, curFrom, range.to)), aggregate(inRange(all, prevFrom, prevTo))),
      series14,
    };
  });

  // Trung vị CPA theo loại kết quả (chỉ creative đủ kết quả).
  const medians = new Map<string, string>();
  const groups = new Map<string, string[]>();
  for (const b of base) {
    if (b.resultType && b.m.cpa && b.m.results >= T.minPeerResults) {
      groups.set(b.resultType, [...(groups.get(b.resultType) ?? []), b.m.cpa]);
    }
  }
  for (const [k, v] of groups) if (v.length >= T.minPeers) medians.set(k, median(v));

  const rows: CreativeRow[] = base.map((b) => {
    let cls: CreativeClass;
    let reason: CreativeRow['reason'];
    const med = b.resultType ? medians.get(b.resultType) : undefined;
    if (b.m.impressions < T.minImpressions || b.m.activeDays < T.minActiveDays) {
      cls = 'insufficient';
      reason = { key: 'insufficient', params: { impressions: T.minImpressions, days: T.minActiveDays } };
    } else if (b.fatigue) {
      cls = 'fatigued';
      reason = {
        key: 'fatigued',
        params: { ctrDrop: Math.round(b.fatigue.ctrDrop * 100), freq: Number(b.fatigue.freq.toFixed(2)) },
      };
    } else if (!med) {
      cls = 'watch';
      reason = { key: 'noPeers', params: { peers: T.minPeers } };
    } else if (b.m.cpa && b.m.results >= T.winnerMinResults && ratio(b.m.cpa, med) <= T.winnerCpaRatio) {
      cls = 'winner';
      reason = { key: 'winner', params: { pct: Math.round((1 - ratio(b.m.cpa, med)) * 100) } };
    } else if (b.m.cpa && ratio(b.m.cpa, med) >= T.loserCpaRatio) {
      cls = 'loser';
      reason = { key: 'loser', params: { ratio: Number(ratio(b.m.cpa, med).toFixed(1)) } };
    } else if (!b.m.cpa && ratio(b.m.spend, med) >= T.loserNoResultSpendRatio) {
      cls = 'loser';
      reason = { key: 'loserNoResult', params: { ratio: T.loserNoResultSpendRatio } };
    } else {
      cls = 'watch';
      reason = { key: 'watch', params: {} };
    }
    return {
      key: `${adAccountId}:${b.creativeId}`,
      adAccountId,
      creativeId: b.creativeId,
      name: b.info?.name ?? null,
      thumbnailUrl: b.info?.thumbnail_url ?? null,
      format: b.info?.format ?? null,
      adCount: Number(b.info?.ad_count ?? 0),
      firstDate: b.firstDate,
      lastDate: b.lastDate,
      resultType: b.resultType,
      metrics: b.m,
      class: cls,
      reason,
      forecast: cls === 'fatigued' || cls === 'insufficient' ? null : fatigueForecast(b.series14),
    };
  });
  return rows
    .filter((r) => compareDecimal(r.metrics.spend, '0') > 0 || r.metrics.impressions > 0)
    .sort((a, b) => compareDecimal(b.metrics.spend, a.metrics.spend));
}

export type CreativeComparison = {
  rows: CreativeRow[];
  series: { key: string; days: { date: string; spend: string; ctr: number | null; cpa: string | null }[] }[];
};

/** P104 So sánh creative (P1-02): tối đa 4 creative cùng tài khoản, chỉ số + chuỗi theo ngày. */
export async function compareCreatives(
  ctx: ActorCtx,
  adAccountId: string,
  creativeIds: string[],
  range: DateRange,
): Promise<CreativeComparison> {
  if (creativeIds.length < 2 || creativeIds.length > 4) throw new AppError('VALIDATION_FAILED', 'Chọn 2–4 creative');
  const lib = await creativeLibrary(ctx, adAccountId, range);
  const rows = creativeIds
    .map((id) => lib.find((r) => r.creativeId === id))
    .filter((r): r is CreativeRow => Boolean(r));
  const days = await loadDays(ctx, adAccountId, range.from, range.to, creativeIds);
  const dates: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) dates.push(d);
  return {
    rows,
    series: rows.map((r) => {
      const list = days.get(r.creativeId) ?? [];
      return {
        key: r.key,
        days: dates.map((date) => {
          const x = list.find((d) => d.date === date);
          return {
            date,
            spend: x?.spend ?? '0',
            ctr: x && x.impressions > 0 ? x.linkClicks / x.impressions : null,
            cpa: x && x.results > 0 ? divDecimal(x.spend, String(x.results)) : null,
          };
        }),
      };
    }),
  };
}
