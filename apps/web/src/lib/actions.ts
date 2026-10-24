/** Màu trạng thái hành động (P203/P204). */
export const ACTION_STATUS_TONE = {
  pending: 'info',
  executing: 'info',
  success: 'success',
  failed: 'danger',
  undone: 'neutral',
  canceled: 'neutral',
} as const;

/** Tiền tệ không có đơn vị lẻ theo Meta (offset 1). */
export const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'PYG']);

type Fmt = { number(n: number, o?: Intl.NumberFormatOptions): string };
type Tr = { t(key: string): string };

/** "ACTIVE → PAUSED" / "300.000 → 330.000" từ trạng thái trước / sau mong đợi (đơn vị nhỏ nhất của tiền tệ). */
export function describeChange(
  a: { beforeState: Record<string, string | null>; afterExpected: Record<string, string | null>; currency: string },
  format: Fmt,
  tr: Tr,
): string {
  if ('daily_budget' in a.afterExpected) {
    // Meta lưu ngân sách theo đơn vị nhỏ nhất: tiền không có phần lẻ (VND, JPY…) = 1; USD… = cent.
    const div = ZERO_DECIMAL.has(a.currency) ? 1 : 100;
    const show = (v: string | null | undefined) =>
      v
        ? format.number(Number(v) / div, {
            style: 'currency',
            currency: a.currency,
            maximumFractionDigits: div === 1 ? 0 : 2,
          })
        : '—';
    return `${show(a.beforeState.daily_budget)} → ${show(a.afterExpected.daily_budget)}`;
  }
  if ('copy_status' in a.afterExpected) return tr.t('copyPaused');
  const s = (v: string | null | undefined) => (v ? tr.t(`state.${v}`) : '—');
  return `${s(a.beforeState.status)} → ${s(a.afterExpected.status)}`;
}
