import { describe, expect, it } from 'vitest';
import { cookieOpen, explainPresets, panelEntities, panelHidden } from './right-panel';

describe('right panel', () => {
  it('ngữ cảnh: trang chi tiết → đối tượng; trang khác → không có', () => {
    expect(panelEntities('/accounts/a1/adset/120000123')).toEqual([{ level: 'adset', metaId: '120000123' }]);
    expect(panelEntities('/accounts/a1')).toEqual([]);
    expect(panelEntities('/accounts/a1/ad/abc')).toEqual([]);
    expect(panelEntities('/w/ads-manager')).toEqual([]);
  });
  it('gợi ý giải thích theo màn', () => {
    expect(explainPresets('/accounts/a1/campaign/1')).toEqual(['entity', 'children']);
    expect(explainPresets('/w/business')).toContain('mer');
    expect(explainPresets('/w')).toEqual(['cpa', 'spend', 'findings']);
  });
  it('ẩn ở trang AI Agents; mặc định gập', () => {
    expect(panelHidden('/w/agents')).toBe(true);
    expect(panelHidden('/w/ads')).toBe(false);
    expect(cookieOpen(undefined)).toBe(false);
    expect(cookieOpen('1')).toBe(true);
  });
});
