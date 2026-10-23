import type { EntitySnapshot, Metrics, Snapshot } from '../types';

/** CTR theo link click. */
export const ctr = (m: Metrics) => (m.impressions > 0 ? m.linkClicks / m.impressions : 0);
/** Chi phí mỗi kết quả (số, chỉ dùng để so sánh tương đối — không lưu). */
export const cpa = (m: Metrics) => (m.results > 0 ? Number(m.spend) / m.results : Number.POSITIVE_INFINITY);
export const spendOf = (m: Metrics) => Number(m.spend);

export function median(xs: number[]): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Ngưỡng tiền theo tiền tệ: VND dùng giá trị VND, tiền tệ khác dùng giá trị "other" (gần USD). */
export function moneyThreshold(s: Snapshot, vnd: number, other: number): number {
  return s.account.currency === 'VND' ? vnd : other;
}

export function isActive(e: EntitySnapshot): boolean {
  return (e.status ?? '').toUpperCase() === 'ACTIVE';
}

/** Mục tiêu tối ưu của ad set (đồng bộ từ Meta, `attrs.optimization_goal`). */
export function goalOf(adset: EntitySnapshot): string | null {
  return (adset.attrs.optimization_goal as string | null | undefined) ?? null;
}

/** Mục tiêu có "kết quả" là sự kiện chuyển đổi (không phải click/hiển thị). */
export const CONVERSION_GOALS = new Set([
  'OFFSITE_CONVERSIONS',
  'VALUE',
  'LEAD_GENERATION',
  'QUALITY_LEAD',
  'CONVERSATIONS',
  'APP_INSTALLS',
]);

export const pct = (x: number) => Math.round(x * 1000) / 10;
export const round2 = (x: number) => Math.round(x * 100) / 100;

export function windowEvidence(s: Snapshot) {
  return { current: [s.window.cur.from, s.window.cur.to], baseline: [s.window.prev.from, s.window.prev.to] };
}
