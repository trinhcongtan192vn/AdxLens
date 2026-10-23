import type { DeltaDirection } from '@adxlens/ui';

/** Chỉ số tăng là tốt hay xấu cho khách (CPA, CPM tăng = xấu). */
export const HIGHER_IS_BETTER: Record<string, boolean> = {
  spend: true,
  results: true,
  impressions: true,
  linkClicks: true,
  ctr: true,
  roas: true,
  conversionValue: true,
  cpa: false,
  cpm: false,
};

/** So sánh kỳ hiện tại với kỳ trước: hướng, % thay đổi (tuyệt đối), tốt/xấu. Không có kỳ trước → null. */
export function kpiDelta(
  key: string,
  cur: number | string | null,
  prev: number | string | null,
): { direction: DeltaDirection; pct: number; good: boolean } | null {
  if (cur === null || prev === null) return null;
  const c = Number(cur);
  const p = Number(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  const change = (c - p) / Math.abs(p);
  const direction: DeltaDirection = Math.abs(change) < 0.0005 ? 'flat' : change > 0 ? 'up' : 'down';
  const up = change > 0;
  return { direction, pct: Math.abs(change), good: (HIGHER_IS_BETTER[key] ?? true) === up };
}
