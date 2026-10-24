import { describe, expect, it } from 'vitest';
import { breadcrumbFor } from './breadcrumb';

describe('breadcrumb thanh trên', () => {
  it('mục sidebar', () => {
    expect(breadcrumbFor('/overview')).toEqual([{ key: 'overview', ns: 'nav' }]);
    expect(breadcrumbFor('/clients/123')).toEqual([{ key: 'clients', ns: 'nav' }]);
  });

  it('Cài đặt › tab', () => {
    expect(breadcrumbFor('/settings/profile')).toEqual([
      { key: 'settings', ns: 'nav' },
      { key: 'profile', ns: 'settings' },
    ]);
  });

  it('trang ngoài sidebar', () => {
    expect(breadcrumbFor('/notifications')).toEqual([{ key: 'notifications', ns: 'pages' }]);
    expect(breadcrumbFor('/la')).toEqual([]);
  });
});
