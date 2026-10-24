import { describe, expect, it } from 'vitest';
import { isWActive, visibleWNav, W_NAV, W_NAV_BOTTOM } from './workspace-nav';

const off = { p0_reports: false, p1_recommendations: false, p2a_approve: false, p2b_auto: false };

describe('điều hướng giao diện Workspace (W3)', () => {
  it('cờ P1 tắt → ẩn Agents; các trang đọc số (P0) luôn hiện', () => {
    expect(visibleWNav(W_NAV, off).map((i) => i.key)).toEqual([
      'home',
      'ads',
      'adsManager',
      'funnels',
      'geography',
      'scale',
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
});
