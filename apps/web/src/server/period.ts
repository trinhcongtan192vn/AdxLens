import 'server-only';
import { cookies } from 'next/headers';
import { PERIOD_COOKIE, periodRange, previousRange, toPeriod, type DateRange } from '@/lib/period';

/** Kỳ đang chọn trên thanh trên (cookie), quy ra khoảng ngày theo múi giờ cho trước + kỳ trước. */
export async function currentRanges(timeZone: string, now = new Date()): Promise<{ cur: DateRange; prev: DateRange }> {
  const period = toPeriod((await cookies()).get(PERIOD_COOKIE)?.value);
  const cur = periodRange(period, now, timeZone);
  return { cur, prev: previousRange(cur) };
}
