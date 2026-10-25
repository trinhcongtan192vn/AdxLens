import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import { addDays, divDecimal, sumDecimal, type ActorCtx } from '@adxlens/core/shared';
import { adFormat, type AdFormat } from './ads-grid';

/** Điểm đầu vào: một creative với tổng trong kỳ (từ thư viện creative P103). */
export type CreativePoint = {
  key: string;
  name: string | null;
  format: string | null;
  spend: string;
  conversionValue: string;
  results: number;
  impressions: number;
  linkClicks: number;
};

export type CreativeQuadrant = 'getting_started' | 'overspend' | 'scalable' | 'core';

export type FormatInsight = {
  format: AdFormat;
  creatives: number;
  spend: string;
  /** % chi tiêu và % doanh thu (giá trị chuyển đổi; không có thì kết quả) của định dạng — Madgicx "% revenue vs % spend". */
  spendShare: number;
  valueShare: number;
  roas: string | null;
  ctr: number | null;
  /** Tỷ lệ chuyển đổi = kết quả / click liên kết (%). */
  cvr: number | null;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const share = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

/**
 * Creative Insights (cải tiến cổ điển theo Madgicx 360° Audit): theo định dạng + cảnh báo thiếu định dạng + ma trận 4
 * góc (chi tiêu × doanh thu, ngưỡng = trung vị của chính các creative có chi tiêu). Hàm thuần trên số đã tính.
 */
export function creativeInsights(points: CreativePoint[]): {
  formats: FormatInsight[];
  missing: AdFormat[];
  matrix: { key: string; name: string | null; quadrant: CreativeQuadrant; spend: string; value: number }[];
  valueBasis: 'revenue' | 'results';
} {
  const live = points.filter((p) => Number(p.spend) > 0);
  const hasRevenue = live.some((p) => Number(p.conversionValue) > 0);
  const value = (p: CreativePoint) => (hasRevenue ? Number(p.conversionValue) : p.results);
  const totalSpend = live.reduce((t, p) => t + Number(p.spend), 0);
  const totalValue = live.reduce((t, p) => t + value(p), 0);
  const groups = new Map<AdFormat, CreativePoint[]>();
  for (const p of live) {
    const f = adFormat(p.format);
    groups.set(f, [...(groups.get(f) ?? []), p]);
  }
  const formats = [...groups]
    .map(([format, list]) => {
      const spend = sumDecimal(list.map((p) => p.spend));
      const rev = sumDecimal(list.map((p) => p.conversionValue));
      const results = list.reduce((t, p) => t + p.results, 0);
      const clicks = list.reduce((t, p) => t + p.linkClicks, 0);
      const impressions = list.reduce((t, p) => t + p.impressions, 0);
      return {
        format,
        creatives: list.length,
        spend,
        spendShare: share(Number(spend), totalSpend),
        valueShare: share(
          list.reduce((t, p) => t + value(p), 0),
          totalValue,
        ),
        roas: Number(rev) > 0 ? divDecimal(rev, spend, 2) : null,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null,
        cvr: clicks > 0 ? Math.round((results / clicks) * 10000) / 100 : null,
      };
    })
    .sort((a, b) => Number(b.spend) - Number(a.spend));
  const missing = (['image', 'video', 'carousel'] as const).filter((f) => !groups.has(f));
  const sMid = median(live.map((p) => Number(p.spend)));
  const vMid = median(live.map(value));
  const matrix = live.map((p) => {
    const highSpend = Number(p.spend) > sMid;
    const highValue = value(p) > vMid;
    const quadrant: CreativeQuadrant = highSpend
      ? highValue
        ? 'core'
        : 'overspend'
      : highValue
        ? 'scalable'
        : 'getting_started';
    return { key: p.key, name: p.name, quadrant, spend: p.spend, value: value(p) };
  });
  return { formats, missing, matrix, valueBasis: hasRevenue ? 'revenue' : 'results' };
}

export type FormatWeek = {
  week: string;
  formats: { format: AdFormat; spend: string; spendShare: number; roas: string | null; results: number }[];
};

/**
 * Xu hướng theo tuần của từng định dạng (Madgicx Creative Insights "weekly trend"): `weeks` tuần (thứ Hai → Chủ nhật)
 * kết thúc ở tuần chứa `endDate`. Chỉ tài khoản người dùng được xem; số do code tính.
 */
export async function creativeFormatTrend(
  ctx: ActorCtx,
  adAccountIds: string[],
  endDate: string,
  weeks = 8,
): Promise<FormatWeek[]> {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  const ids = adAccountIds.filter((id) => allowed.has(id));
  if (!ids.length) return [];
  const from = addDays(endDate, -(weeks * 7 - 1));
  const rows = await ctx.db.execute<{
    week: string;
    object_type: string | null;
    video_id: string | null;
    spend: string;
    value: string | null;
    results: string;
  }>(sql`
    select to_char(date_trunc('week', i.date), 'YYYY-MM-DD') as week, cr.attrs->>'format' as object_type,
      cr.attrs->>'video_id' as video_id, sum(i.spend)::text as spend, sum(i.conversion_value)::text as value,
      sum(i.results)::text as results
    from analytics.insights_daily i
    join analytics.entities a
      on a.workspace_id = i.workspace_id and a.ad_account_id = i.ad_account_id and a.entity_type = 'ad'
      and a.meta_id = i.meta_id
    left join analytics.entities cr
      on cr.workspace_id = a.workspace_id and cr.ad_account_id = a.ad_account_id and cr.entity_type = 'creative'
      and cr.meta_id = a.attrs->>'creative_id'
    where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids} and i.entity_type = 'ad'
      and i.date between ${from} and ${endDate}
    group by 1, 2, 3`);
  const byWeek = new Map<string, Map<AdFormat, { spend: string[]; value: string[]; results: number }>>();
  for (const r of rows) {
    const f = adFormat(r.object_type, Boolean(r.video_id));
    const w = byWeek.get(r.week) ?? new Map();
    const g = w.get(f) ?? { spend: [], value: [], results: 0 };
    g.spend.push(r.spend);
    if (r.value) g.value.push(r.value);
    g.results += Number(r.results);
    w.set(f, g);
    byWeek.set(r.week, w);
  }
  return [...byWeek.keys()].sort().map((week) => {
    const w = byWeek.get(week)!;
    const total = [...w.values()].reduce((t, g) => t + Number(sumDecimal(g.spend)), 0);
    return {
      week,
      formats: [...w]
        .map(([format, g]) => {
          const spend = sumDecimal(g.spend);
          const value = sumDecimal(g.value);
          return {
            format,
            spend,
            spendShare: share(Number(spend), total),
            roas: Number(value) > 0 && Number(spend) > 0 ? divDecimal(value, spend, 2) : null,
            results: g.results,
          };
        })
        .sort((a, b) => Number(b.spend) - Number(a.spend)),
    };
  });
}
