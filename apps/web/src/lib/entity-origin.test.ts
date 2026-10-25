import { describe, expect, it } from 'vitest';
import { activeNavPath, isEntityDetail, parseOrigin, withOrigin } from './entity-origin';

describe('entity-origin (chi tiết mở ở khung giữa, nhớ trang nguồn)', () => {
  it('nguồn lạ / thiếu → Ads Manager', () => {
    expect(parseOrigin('ads')).toBe('ads');
    expect(parseOrigin(null)).toBe('ads-manager');
    expect(parseOrigin('../../x')).toBe('ads-manager');
  });
  it('thêm from= (giữ tham số); nguồn mặc định không thêm', () => {
    expect(withOrigin('/accounts/a/ad/1', 'ads')).toBe('/accounts/a/ad/1?from=ads');
    expect(withOrigin('/accounts/a/ad/1?tab=history', 'scale')).toBe('/accounts/a/ad/1?tab=history&from=scale');
    expect(withOrigin('/accounts/a/ad/1', 'ads-manager')).toBe('/accounts/a/ad/1');
  });
  it('sidebar: trang chi tiết sáng mục nguồn', () => {
    expect(isEntityDetail('/accounts/a/campaign/1')).toBe(true);
    expect(isEntityDetail('/accounts/a')).toBe(false);
    expect(activeNavPath('/accounts/a/ad/1', 'from=ads')).toBe('/w/ads');
    expect(activeNavPath('/accounts/a/adset/1', '')).toBe('/w/ads-manager');
    expect(activeNavPath('/w/funnels', '')).toBe('/w/funnels');
  });
});
