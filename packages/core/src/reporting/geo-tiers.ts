import { sumDecimal, divDecimal, type ActorCtx } from '@adxlens/core/shared';
import { breakdownTable, type BreakdownRow } from './report-extras';

type DateRange = { from: string; to: string };

/**
 * Phân tầng quốc gia cho mở rộng quốc tế (Madgicx Geo & Demo "International scaling Tier 1–4"). Tham khảo theo mức thu
 * nhập / giá quảng cáo phổ biến trong ngành; không phải phân loại chính thức của Meta.
 */
const TIERS: Record<1 | 2 | 3, readonly string[]> = {
  1: 'US CA GB AU NZ IE DE FR NL BE LU CH AT SE NO DK FI IS SG JP'.split(' '),
  2: 'KR TW HK IT ES PT IL AE SA QA KW BH OM CZ PL SI EE GR CY MT'.split(' '),
  3: 'VN TH MY ID PH CN BR MX AR CL CO PE TR RU ZA RO HU BG HR IN'.split(' '),
};
export type CountryTier = 1 | 2 | 3 | 4;

export function tierOf(country: string): CountryTier {
  const c = country.toUpperCase();
  for (const t of [1, 2, 3] as const) if (TIERS[t].includes(c)) return t;
  return 4;
}

/** Xu hướng chi tiêu so kỳ trước: tăng / giảm ≥ 20% (có chi tiêu đủ lớn) là "đang lên" / "đang xuống". */
export const TREND_THRESHOLD_PCT = 20;

export type TrendRow = BreakdownRow & {
  prevSpend: string;
  spendChangePct: number | null;
  trend: 'rising' | 'falling' | 'new' | null;
  wasted: boolean;
};

export function withTrend(cur: BreakdownRow[], prev: BreakdownRow[]): TrendRow[] {
  const p = new Map(prev.map((r) => [r.key, r]));
  return cur.map((r) => {
    const before = p.get(r.key);
    const prevSpend = before?.spend ?? '0';
    const change =
      Number(prevSpend) > 0
        ? Math.round(((Number(r.spend) - Number(prevSpend)) / Number(prevSpend)) * 1000) / 10
        : null;
    const trend =
      Number(prevSpend) === 0 && Number(r.spend) > 0
        ? 'new'
        : change == null
          ? null
          : change >= TREND_THRESHOLD_PCT
            ? 'rising'
            : change <= -TREND_THRESHOLD_PCT
              ? 'falling'
              : null;
    return { ...r, prevSpend, spendChangePct: change, trend, wasted: Number(r.spend) > 0 && r.results === 0 };
  });
}

export type TierSummary = {
  tier: CountryTier;
  countries: number;
  spend: string;
  share: number;
  results: number;
  cpa: string | null;
};

/** Quốc gia: bảng theo nước (kèm Tier, xu hướng) + tổng theo Tier. Số do code tính. */
export async function countryAnalysis(
  ctx: ActorCtx,
  ids: string[],
  cur: DateRange,
  prev: DateRange,
): Promise<{ countries: (TrendRow & { tier: CountryTier })[]; tiers: TierSummary[] }> {
  const [c, p] = await Promise.all([
    breakdownTable(ctx, ids, cur, 'country', 300),
    breakdownTable(ctx, ids, prev, 'country', 300),
  ]);
  const countries = withTrend(c, p).map((r) => ({ ...r, tier: tierOf(r.key) }));
  const total = countries.reduce((s, r) => s + Number(r.spend), 0);
  const tiers = ([1, 2, 3, 4] as const)
    .map((tier) => {
      const rows = countries.filter((r) => r.tier === tier);
      const spend = sumDecimal(rows.map((r) => r.spend));
      const results = rows.reduce((s, r) => s + r.results, 0);
      return {
        tier,
        countries: rows.length,
        spend,
        share: total > 0 ? Math.round((Number(spend) / total) * 1000) / 10 : 0,
        results,
        cpa: results > 0 ? divDecimal(spend, String(results), 2) : null,
      };
    })
    .filter((t) => t.countries > 0);
  return { countries, tiers };
}

/** Khu vực đang lên / xuống so kỳ trước (Madgicx "Trending countries", áp cho khu vực Meta trả về). */
export async function trendingRegions(ctx: ActorCtx, ids: string[], cur: DateRange, prev: DateRange) {
  const [c, p] = await Promise.all([
    breakdownTable(ctx, ids, cur, 'region', 200),
    breakdownTable(ctx, ids, prev, 'region', 200),
  ]);
  return withTrend(c, p);
}
