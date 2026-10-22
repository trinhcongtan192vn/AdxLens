import { describe, expect, it } from 'vitest';
import { localDate, periodRange, previousRange, toPeriod } from './period';

// 2026-10-22 01:30 giờ Việt Nam = 2026-10-21 18:30 UTC.
const now = new Date('2026-10-21T18:30:00Z');
const HCM = 'Asia/Ho_Chi_Minh';

describe('kỳ thời gian', () => {
  it('ngày theo múi giờ, không theo UTC', () => {
    expect(localDate(now, HCM)).toBe('2026-10-22');
    expect(localDate(now, 'America/Los_Angeles')).toBe('2026-10-21');
  });

  it('7 ngày qua kết thúc hôm qua theo múi giờ', () => {
    expect(periodRange('last7', now, HCM)).toEqual({ from: '2026-10-15', to: '2026-10-21' });
  });

  it('tháng trước', () => {
    expect(periodRange('lastMonth', now, HCM)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('tháng này tới hôm qua', () => {
    expect(periodRange('thisMonth', now, HCM)).toEqual({ from: '2026-10-01', to: '2026-10-21' });
  });

  it('kỳ so sánh liền trước cùng độ dài', () => {
    expect(previousRange({ from: '2026-10-15', to: '2026-10-21' })).toEqual({
      from: '2026-10-08',
      to: '2026-10-14',
    });
  });

  it('giá trị lạ về mặc định', () => {
    expect(toPeriod('xyz')).toBe('last7');
  });
});
