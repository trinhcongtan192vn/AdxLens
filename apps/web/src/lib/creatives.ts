import type { CreativeClass } from '@adxlens/core/recommendation';

/** Màu nhãn phân loại creative (P103): thắng xanh, theo dõi xanh dương, mệt vàng, thua đỏ. */
export const CLASS_TONE: Record<CreativeClass, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  winner: 'success',
  watch: 'info',
  fatigued: 'warning',
  loser: 'danger',
  insufficient: 'neutral',
};

/** `ids` từ form so sánh (lặp tham số hoặc phân tách dấu phẩy) → 2–4 mã duy nhất. */
export function parseCompareIds(v: string | string[] | undefined): string[] {
  const list = (Array.isArray(v) ? v : v ? [v] : []).flatMap((s) => s.split(','));
  return [...new Set(list.map((s) => s.trim()).filter((s) => /^[\w-]{1,64}$/.test(s)))].slice(0, 4);
}
