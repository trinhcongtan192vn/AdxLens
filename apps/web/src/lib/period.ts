export const PERIODS = ['last7', 'last14', 'last30', 'thisMonth', 'lastMonth'] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = 'last7';
export const PERIOD_COOKIE = 'period';

export function toPeriod(v: string | undefined | null): Period {
  return (PERIODS as readonly string[]).includes(v ?? '') ? (v as Period) : DEFAULT_PERIOD;
}

/** Ngày (YYYY-MM-DD) của `now` theo múi giờ cho trước. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DateRange = { from: string; to: string };

/**
 * Khoảng ngày của kỳ, theo múi giờ (ad account hoặc workspace). Kỳ "N ngày qua" kết thúc hôm qua:
 * dữ liệu hôm nay chưa chốt (Meta có thể điều chỉnh trong 72 giờ).
 */
export function periodRange(period: Period, now: Date, timeZone: string): DateRange {
  const today = localDate(now, timeZone);
  const yesterday = addDays(today, -1);
  switch (period) {
    case 'last7':
      return { from: addDays(yesterday, -6), to: yesterday };
    case 'last14':
      return { from: addDays(yesterday, -13), to: yesterday };
    case 'last30':
      return { from: addDays(yesterday, -29), to: yesterday };
    case 'thisMonth':
      return {
        from: `${today.slice(0, 7)}-01`,
        to: today === `${today.slice(0, 7)}-01` ? today : yesterday,
      };
    case 'lastMonth': {
      const firstThis = `${today.slice(0, 7)}-01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
  }
}

/** Kỳ so sánh liền trước, cùng độ dài. */
export function previousRange(r: DateRange): DateRange {
  const len = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

/**
 * Trang (giao diện cổ điển) có số theo kỳ → hiện bộ chọn kỳ ở thanh trên (PM 25/10: không hiện ở trang không lọc theo
 * ngày được). Trang Workspace `/w/*` tự đặt bộ lọc kỳ cạnh vùng dữ liệu.
 */
export function periodApplies(pathname: string): boolean {
  return /^\/(accounts\/[^/]+|clients\/[0-9a-f-]{36}$|creatives(\/|$))/.test(pathname);
}
