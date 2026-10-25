// Điều hướng trang admin theo luồng việc của operator (không phụ thuộc React để test được).

export type AdminInboxKey =
  'incidents' | 'syncs' | 'reconciliation' | 'breakers' | 'billing' | 'deletions' | 'flagProposals';

export type AdminNavKey =
  | 'today'
  | 'workspaces'
  | 'incidents'
  | 'operations'
  | 'reconciliation'
  | 'execution'
  | 'killSwitch'
  | 'flags'
  | 'billing'
  | 'deletions'
  | 'audit'
  | 'staff'
  | 'emails'
  | 'system';

export type AdminNavItem = {
  key: AdminNavKey;
  href: string;
  /** Số việc đang chờ hiển thị cạnh mục (từ "Hôm nay"). */
  badge?: AdminInboxKey;
  /** Operator chỉ xem được, thao tác cần superadmin (ADR-0013). */
  superadminOnly?: boolean;
};

export type AdminNavGroup = { key: string | null; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  { key: null, items: [{ key: 'today', href: '/admin' }] },
  { key: 'customers', items: [{ key: 'workspaces', href: '/admin/workspaces' }] },
  {
    key: 'data',
    items: [
      { key: 'incidents', href: '/admin/incidents', badge: 'incidents' },
      { key: 'operations', href: '/admin/operations', badge: 'syncs' },
      { key: 'reconciliation', href: '/admin/reconciliation', badge: 'reconciliation' },
    ],
  },
  {
    key: 'safety',
    items: [
      { key: 'execution', href: '/admin/execution', badge: 'breakers' },
      { key: 'killSwitch', href: '/admin/kill-switch' },
    ],
  },
  { key: 'release', items: [{ key: 'flags', href: '/admin/flags', badge: 'flagProposals' }] },
  { key: 'revenue', items: [{ key: 'billing', href: '/admin/billing', badge: 'billing' }] },
  {
    key: 'compliance',
    items: [
      { key: 'deletions', href: '/admin/deletions', badge: 'deletions' },
      { key: 'audit', href: '/admin/audit' },
    ],
  },
  {
    key: 'config',
    items: [
      { key: 'staff', href: '/admin/staff', superadminOnly: true },
      { key: 'emails', href: '/admin/emails' },
      { key: 'system', href: '/admin/system', superadminOnly: true },
    ],
  },
];

/** Mục đang mở: "Hôm nay" chỉ khi đúng `/admin`; mục khác khớp cả trang con (vd. /admin/workspaces/[id]). */
export function isAdminNavActive(href: string, pathname: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname === '/admin/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Màu số trên mục: đỏ khi có việc khẩn, xám khi có việc thường, ẩn khi 0. */
export function badgeTone(item: { count: number; urgent: boolean } | undefined): 'danger' | 'neutral' | null {
  if (!item || item.count === 0) return null;
  return item.urgent ? 'danger' : 'neutral';
}
