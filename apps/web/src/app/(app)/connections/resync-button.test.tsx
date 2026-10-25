import { describe, expect, it } from 'vitest';
import { minusDays } from './resync-button';

describe('đồng bộ lại: khoảng ngày', () => {
  it('lùi theo lịch, qua tháng / năm, không phụ thuộc múi giờ máy', () => {
    expect(minusDays('2026-10-24', 6)).toBe('2026-10-18');
    expect(minusDays('2026-03-01', 1)).toBe('2026-02-28');
    expect(minusDays('2026-01-05', 29)).toBe('2025-12-07');
  });
});
