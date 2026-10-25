import { describe, expect, it } from 'vitest';
import { isWActive, shellNav, visibleWNav, W_NAV, W_NAV_BOTTOM } from './workspace-nav';

const off = { p0_reports: false, p1_recommendations: false, p2a_approve: false, p2b_auto: false };

describe('điều hướng giao diện Workspace (W3)', () => {
  it('cờ P1 tắt → ẩn Agents; các trang đọc số (P0) luôn hiện', () => {
    expect(visibleWNav(W_NAV, off).map((i) => i.key)).toEqual([
      'home',
      'business',
      'ads',
      'adsManager',
      'funnels',
      'geography',
      'scale',
      'audiences',
    ]);
    expect(visibleWNav(W_NAV, { ...off, p1_recommendations: true }).map((i) => i.key)).toContain('agents');
    expect(visibleWNav(W_NAV_BOTTOM, off).map((i) => i.key)).toEqual(['alerts']);
  });

  it('mục đang chọn: Home chỉ khớp đúng /w, trang con khớp tiền tố', () => {
    expect(isWActive('/w', '/w')).toBe(true);
    expect(isWActive('/w/ads', '/w')).toBe(false);
    expect(isWActive('/w/ads', '/w/ads')).toBe(true);
    expect(isWActive('/w/ads-manager', '/w/ads')).toBe(false);
    expect(isWActive('/w/alerts/new', '/w/alerts')).toBe(true);
  });

  it('khung chung: 3 nhóm gom đủ mục của 2 giao diện cũ; cờ / vai trò ẩn mục như trước', () => {
    const keys = (f: typeof off, role: 'owner' | 'buyer' = 'owner') => {
      const n = shellNav(f, role);
      return { groups: n.groups.map((g) => [g.key, g.items.map((i) => i.key)]), bottom: n.bottom.map((i) => i.key) };
    };
    // Cờ tắt: không có mục P1 / P2, nhóm Thực thi rỗng nên ẩn.
    expect(keys(off)).toEqual({
      groups: [
        ['analysis', ['home', 'business', 'ads', 'adsManager', 'funnels', 'geography', 'scale', 'audiences']],
        ['clients', ['clients']],
      ],
      bottom: ['alerts', 'connections', 'settings'],
    });
    const on = { p0_reports: true, p1_recommendations: true, p2a_approve: true, p2b_auto: true };
    expect(keys(on).groups.slice(1)).toEqual([
      ['clients', ['clients', 'reports', 'weeklyActions', 'creatives']],
      ['execution', ['agents', 'launcher', 'automation', 'actionLog']],
    ]);
    // Buyer: không có Báo cáo và Kết nối.
    const buyer = keys(on, 'buyer');
    expect(buyer.groups[1]![1]).not.toContain('reports');
    expect(buyer.bottom).toEqual(['alerts', 'settings']);
    // Mục từ giao diện cũ dùng nhãn `nav.*`, mục Workspace dùng `ws.nav.*`.
    const all = shellNav(on, 'owner').groups.flatMap((g) => g.items);
    expect(all.find((i) => i.key === 'creatives')).toMatchObject({ ns: 'nav', href: '/creatives' });
    expect(all.find((i) => i.key === 'launcher')).toMatchObject({ ns: 'ws.nav', href: '/w/launcher' });
  });
});
