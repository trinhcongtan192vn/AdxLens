import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, badgeTone, isAdminNavActive } from './admin-nav';

describe('điều hướng admin', () => {
  it('mỗi trang admin có đúng một mục, không trùng đường dẫn', () => {
    const hrefs = ADMIN_NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/admin',
        '/admin/workspaces',
        '/admin/incidents',
        '/admin/operations',
        '/admin/reconciliation',
        '/admin/execution',
        '/admin/kill-switch',
        '/admin/flags',
        '/admin/billing',
        '/admin/deletions',
        '/admin/audit',
        '/admin/staff',
        '/admin/emails',
        '/admin/system',
      ]),
    );
  });

  it('mục đang mở: Hôm nay chỉ ở /admin; trang con khớp mục cha', () => {
    expect(isAdminNavActive('/admin', '/admin')).toBe(true);
    expect(isAdminNavActive('/admin', '/admin/flags')).toBe(false);
    expect(isAdminNavActive('/admin/workspaces', '/admin/workspaces/abc')).toBe(true);
    expect(isAdminNavActive('/admin/workspaces', '/admin/workspaces-x')).toBe(false);
  });

  it('màu số: khẩn → đỏ, thường → xám, 0 → ẩn', () => {
    expect(badgeTone({ count: 2, urgent: true })).toBe('danger');
    expect(badgeTone({ count: 2, urgent: false })).toBe('neutral');
    expect(badgeTone({ count: 0, urgent: true })).toBeNull();
    expect(badgeTone(undefined)).toBeNull();
  });
});
