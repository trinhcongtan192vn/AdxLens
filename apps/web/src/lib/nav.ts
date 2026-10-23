import type { FlagKey } from '@adxlens/core/flags';
import type { Role } from '@adxlens/core/shared';

export type NavKey =
  | 'overview'
  | 'clients'
  | 'reports'
  | 'weeklyActions'
  | 'creatives'
  | 'actionLog'
  | 'automation'
  | 'connections'
  | 'settings';

export type NavItem = {
  key: NavKey;
  href: string;
  icon: string;
  /** Mục chỉ hiện khi cờ bật (ẩn hẳn khi tắt, CLAUDE.md quy tắc 7). */
  flag?: FlagKey;
  roles?: Role[];
};

/** 9 mục sidebar (validation.md mục 2); Báo cáo sau cờ `p0_reports`, 4 mục sau cờ P1/P2. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', href: '/overview', icon: 'LayoutDashboard' },
  { key: 'clients', href: '/clients', icon: 'Building2' },
  { key: 'reports', href: '/reports', icon: 'FileText', roles: ['owner', 'manager'], flag: 'p0_reports' },
  { key: 'weeklyActions', href: '/weekly-actions', icon: 'ListChecks', flag: 'p1_recommendations' },
  { key: 'creatives', href: '/creatives', icon: 'Images', flag: 'p1_recommendations' },
  { key: 'actionLog', href: '/action-log', icon: 'History', flag: 'p2a_approve' },
  { key: 'automation', href: '/automation', icon: 'Workflow', flag: 'p2b_auto' },
  { key: 'connections', href: '/connections', icon: 'Plug', roles: ['owner', 'manager'] },
  { key: 'settings', href: '/settings', icon: 'Settings' },
];

export function visibleNav(flags: Record<FlagKey, boolean>, role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => (!i.flag || flags[i.flag]) && (!i.roles || i.roles.includes(role)));
}

export function isActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
