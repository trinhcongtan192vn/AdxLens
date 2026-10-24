// Hàm thuần cho bảng chiến dịch / nhóm QC / quảng cáo (G1). Không phụ thuộc React để test được.

const SCALE = 4;

function toScaled(v: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v.trim());
  if (!m) return 0n;
  const [, sign, int, frac = ''] = m;
  const n = BigInt(int!) * 10n ** BigInt(SCALE) + BigInt((frac + '0'.repeat(SCALE)).slice(0, SCALE) || '0');
  return sign === '-' ? -n : n;
}

/** Cộng hai số tiền dạng chuỗi thập phân trên BigInt (không qua số thực — CLAUDE.md quy tắc 4). */
export function addDecimal(a: string, b: string): string {
  const n = toScaled(a) + toScaled(b);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const base = 10n ** BigInt(SCALE);
  return `${neg ? '-' : ''}${abs / base}.${String(abs % base).padStart(SCALE, '0')}`;
}

/** % thay đổi so với kỳ trước; không có kỳ trước / kỳ trước = 0 → null (không hiện). */
export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export type MetricKey =
  'spend' | 'impressions' | 'linkClicks' | 'ctr' | 'results' | 'cpa' | 'roas' | 'conversionValue' | 'cpm';

/** Bộ cột như Google Ads (G4): mỗi bộ trả lời một câu hỏi — hiệu suất, chuyển đổi, phân phối. */
export const COLUMN_SETS = {
  performance: ['spend', 'impressions', 'linkClicks', 'ctr', 'results', 'cpa', 'roas'],
  conversion: ['spend', 'results', 'cpa', 'conversionValue', 'roas'],
  delivery: ['spend', 'impressions', 'cpm', 'linkClicks', 'ctr'],
} as const satisfies Record<string, readonly MetricKey[]>;
export type ColumnSet = keyof typeof COLUMN_SETS;
