import { describe, expect, it } from 'vitest';
import { kpiDelta } from './kpi';

describe('delta KPI', () => {
  it('chi tiêu tăng 10% = tốt; CPA tăng = xấu', () => {
    expect(kpiDelta('spend', '110', '100')).toEqual({ direction: 'up', pct: 0.1, good: true });
    expect(kpiDelta('cpa', '120', '100')).toMatchObject({ direction: 'up', good: false });
    expect(kpiDelta('cpa', '80', '100')).toMatchObject({ direction: 'down', good: true });
  });
  it('kỳ trước 0 hoặc thiếu → không so sánh; gần bằng → flat', () => {
    expect(kpiDelta('spend', '10', '0')).toBeNull();
    expect(kpiDelta('roas', null, '2')).toBeNull();
    expect(kpiDelta('ctr', 0.01, 0.010001)!.direction).toBe('flat');
  });
});
