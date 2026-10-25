import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import { divDecimal, sumDecimal, type ActorCtx } from '@adxlens/core/shared';
import { adsGrid, type AdFormat } from './ads-grid';
import { entityMetricValues, metricSeries, metricValues, type MetricValues } from './metric-catalog';
import type { DateRange } from './metrics';
import { breakdownTable } from './report-extras';

/**
 * Phân tích của Workspace (W8, Madgicx "Funnels / Geography / Scale"). Mọi số do code tính từ insight và breakdown đã
 * lưu, không LLM.
 */

export type FunnelStage = { key: 'impressions' | 'link_clicks' | 'add_to_cart' | 'conversions'; value: number };
export type Funnel = {
  stages: FunnelStage[];
  /** Tỷ lệ chuyển giữa các bước liên tiếp (%), null khi bước trước = 0. */
  rates: (number | null)[];
  conversionLabel: 'purchases' | 'leads' | 'results';
};

function funnelOf(m: MetricValues): Funnel {
  const purchases = Number(m.purchases ?? 0);
  const leads = Number(m.leads ?? 0);
  const conversionLabel = purchases > 0 ? 'purchases' : leads > 0 ? 'leads' : 'results';
  const conv = purchases > 0 ? purchases : leads > 0 ? leads : Number(m.results ?? 0);
  const stages: FunnelStage[] = [
    { key: 'impressions', value: Number(m.impressions ?? 0) },
    { key: 'link_clicks', value: Number(m.link_clicks ?? 0) },
    { key: 'add_to_cart', value: Number(m.add_to_cart ?? 0) },
    { key: 'conversions', value: conv },
  ];
  // Bỏ bước "thêm giỏ" khi tài khoản không có sự kiện này (lead gen, traffic).
  const shown = stages[2]!.value > 0 ? stages : stages.filter((s) => s.key !== 'add_to_cart');
  const rates = shown.slice(1).map((s, i) => {
    const before = shown[i]!.value;
    return before > 0 ? Math.round((s.value / before) * 10000) / 100 : null;
  });
  return { stages: shown, rates, conversionLabel };
}

export type FunnelRow = { metaId: string; name: string | null; funnel: Funnel; spend: string };

/** Phễu Awareness → Consideration → Conversion của phạm vi + theo chiến dịch / nhóm QC. */
export async function funnelAnalysis(
  ctx: ActorCtx,
  ids: string[],
  range: DateRange,
  by: 'campaign' | 'adset',
  names: Map<string, string | null>,
): Promise<{ total: Funnel; rows: FunnelRow[] }> {
  const [total, per] = await Promise.all([metricValues(ctx, ids, range), entityMetricValues(ctx, ids, by, range)]);
  const rows = [...per]
    .map(([metaId, m]) => ({ metaId, name: names.get(metaId) ?? null, funnel: funnelOf(m), spend: m.spend ?? '0' }))
    .filter((r) => Number(r.spend) > 0)
    .sort((a, b) => Number(b.spend) - Number(a.spend));
  return { total: funnelOf(total), rows };
}

export type GeoRow = {
  key: string;
  spend: string;
  results: number;
  cpa: string | null;
  ctr: number | null;
  share: number;
  /** Có chi tiêu nhưng không có kết quả trong kỳ (Madgicx "wasted spend"). */
  wasted: boolean;
};

/** Theo khu vực (breakdown `region`): chi tiêu, kết quả, CPA, CTR, tỷ trọng; đánh dấu vùng chi mà không có kết quả. */
export async function geographyAnalysis(
  ctx: ActorCtx,
  ids: string[],
  range: DateRange,
): Promise<{ rows: GeoRow[]; wastedSpend: string }> {
  const rows = (await breakdownTable(ctx, ids, range, 'region', 200)).map((r) => ({
    ...r,
    wasted: Number(r.spend) > 0 && r.results === 0,
  }));
  return { rows, wastedSpend: sumDecimal(rows.filter((r) => r.wasted).map((r) => r.spend)) };
}

export type FatigueQuadrant = 'fresh_cheap' | 'burning_out' | 'expensive_early' | 'still_holding';
export type FatiguePoint = {
  adAccountId: string;
  metaId: string;
  name: string | null;
  frequency: number;
  cpc: number;
  spend: string;
  quadrant: FatigueQuadrant;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * "Quảng cáo có mệt không?" (Madgicx Scale): mỗi quảng cáo có chi tiêu là một điểm tần suất × CPC, kích thước = chi
 * tiêu. Ngưỡng 4 góc = trung vị của chính các quảng cáo trong phạm vi.
 */
export function classifyFatigue(points: Omit<FatiguePoint, 'quadrant'>[]): {
  points: FatiguePoint[];
  freqMid: number;
  cpcMid: number;
} {
  const freqMid = median(points.map((p) => p.frequency));
  const cpcMid = median(points.map((p) => p.cpc));
  return {
    freqMid,
    cpcMid,
    points: points.map((p) => {
      const tired = p.frequency > freqMid;
      const pricey = p.cpc > cpcMid;
      const quadrant: FatigueQuadrant = tired
        ? pricey
          ? 'burning_out'
          : 'still_holding'
        : pricey
          ? 'expensive_early'
          : 'fresh_cheap';
      return { ...p, quadrant };
    }),
  };
}

export type FormatMixRow = {
  format: AdFormat;
  spend: string;
  share: number;
  roas: string | null;
  cpa: string | null;
  ads: number;
};

/** Trang Mở rộng: điểm mệt mỏi + tỷ trọng / ROAS theo định dạng + tuổi × giới tính + xu hướng ngày. */
export async function scaleAnalysis(ctx: ActorCtx, ids: string[], range: DateRange, prev: DateRange) {
  const [cards, ageGender, trend] = await Promise.all([
    adsGrid(ctx, ids, range, prev),
    breakdownTable(ctx, ids, range, 'age_gender', 200),
    metricSeries(ctx, ids, range),
  ]);
  const withSpend = cards.filter((c) => Number(c.metrics.spend) > 0 && c.metrics.frequency && c.metrics.cpc);
  const fatigue = classifyFatigue(
    withSpend.map((c) => ({
      adAccountId: c.adAccountId,
      metaId: c.metaId,
      name: c.name,
      frequency: Number(c.metrics.frequency),
      cpc: Number(c.metrics.cpc),
      spend: c.metrics.spend ?? '0',
    })),
  );
  const totalSpend = sumDecimal(cards.map((c) => c.metrics.spend));
  const byFormat = new Map<AdFormat, typeof cards>();
  for (const c of cards) byFormat.set(c.format, [...(byFormat.get(c.format) ?? []), c]);
  const formatMix: FormatMixRow[] = [...byFormat]
    .map(([format, list]) => {
      const spend = sumDecimal(list.map((c) => c.metrics.spend));
      const value = sumDecimal(list.map((c) => c.metrics.purchase_value));
      const results = list.reduce((t, c) => t + Number(c.metrics.results ?? 0), 0);
      return {
        format,
        spend,
        share: Number(totalSpend) > 0 ? Math.round((Number(spend) / Number(totalSpend)) * 1000) / 10 : 0,
        roas: Number(value) > 0 ? divDecimal(value, spend, 2) : null,
        cpa: results > 0 ? divDecimal(spend, String(results)) : null,
        ads: list.length,
      };
    })
    .sort((a, b) => Number(b.spend) - Number(a.spend));
  return {
    fatigue,
    formatMix,
    ageGender,
    trend: trend.map((d) => ({ date: d.date, spend: d.values.spend, results: d.values.results, hasData: d.hasData })),
  };
}

/** Tên đối tượng theo cấp (cho bảng phân tích). */
export async function entityNames(
  ctx: ActorCtx,
  ids: string[],
  level: 'campaign' | 'adset' | 'ad',
): Promise<Map<string, string | null>> {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  const ok = ids.filter((id) => allowed.has(id));
  if (!ok.length) return new Map();
  const rows = await ctx.db.execute<{ meta_id: string; name: string | null }>(sql`
    select meta_id, name from analytics.entities
    where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ok} and entity_type = ${level}`);
  return new Map(rows.map((r) => [r.meta_id, r.name]));
}
