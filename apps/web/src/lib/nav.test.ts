import { describe, expect, it } from 'vitest';
import { isActive, NAV_ITEMS, visibleNav } from './nav';

const off = { p0_reports: false, p1_recommendations: false, p2a_approve: false, p2b_auto: false };

describe('sidebar', () => {
  it('có 9 mục: Báo cáo sau cờ p0_reports, 4 mục sau cờ P1/P2', () => {
    expect(NAV_ITEMS).toHaveLength(9);
    expect(NAV_ITEMS.filter((i) => i.flag)).toHaveLength(5);
    expect(NAV_ITEMS.find((i) => i.key === 'reports')!.flag).toBe('p0_reports');
  });

  it('cờ tắt thì ẩn hẳn mục của cờ đó (test "cờ tắt thì không hiện")', () => {
    const keys = visibleNav(off, 'owner').map((i) => i.key);
    expect(keys).toEqual(['overview', 'clients', 'connections', 'settings']);
    expect(visibleNav({ ...off, p0_reports: true }, 'owner').map((i) => i.key)).toEqual([
      'overview',
      'clients',
      'reports',
      'connections',
      'settings',
    ]);
  });

  it('bật cờ nào hiện mục của cờ đó', () => {
    const keys = visibleNav({ ...off, p1_recommendations: true }, 'owner').map((i) => i.key);
    expect(keys).toContain('weeklyActions');
    expect(keys).toContain('creatives');
    expect(keys).not.toContain('actionLog');
  });

  it('buyer không thấy Báo cáo và Kết nối', () => {
    const keys = visibleNav(off, 'buyer').map((i) => i.key);
    expect(keys).toEqual(['overview', 'clients', 'settings']);
  });

  it('mục đang chọn theo tiền tố đường dẫn', () => {
    const clients = NAV_ITEMS.find((i) => i.key === 'clients')!;
    expect(isActive(clients, '/clients/abc')).toBe(true);
    expect(isActive(clients, '/clientsx')).toBe(false);
  });
});
