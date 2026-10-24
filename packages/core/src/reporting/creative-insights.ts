import { divDecimal, sumDecimal } from '@adxlens/core/shared';
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
