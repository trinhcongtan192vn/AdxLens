import type { FlagKey } from '@adxlens/core/flags';

/** Giao diện Workspace (song song giao diện cổ điển, lộ trình W3): bố cục theo Madgicx Workspace. */
export const W_SCOPE_COOKIE = 'w_scope';
/** 4 KPI trang chủ, nối bằng dấu chấm. */
export const W_KPIS_COOKIE = 'w_kpis';
export const W_BASE = '/w';

export type WNavKey =
  'home' | 'agents' | 'business' | 'ads' | 'adsManager' | 'funnels' | 'geography' | 'scale' | 'audiences' | 'alerts';

export type WNavItem = { key: WNavKey; href: string; flag?: FlagKey };

export const W_NAV: WNavItem[] = [
  { key: 'home', href: '/w' },
  { key: 'agents', href: '/w/agents', flag: 'p1_recommendations' },
  { key: 'business', href: '/w/business' },
  { key: 'ads', href: '/w/ads' },
  { key: 'adsManager', href: '/w/ads-manager' },
  { key: 'funnels', href: '/w/funnels' },
  { key: 'geography', href: '/w/geography' },
  { key: 'scale', href: '/w/scale' },
  { key: 'audiences', href: '/w/audiences' },
];

/** Mục ở đáy sidebar. */
export const W_NAV_BOTTOM: WNavItem[] = [{ key: 'alerts', href: '/w/alerts' }];

export function visibleWNav(items: WNavItem[], flags: Record<FlagKey, boolean>): WNavItem[] {
  return items.filter((i) => !i.flag || flags[i.flag]);
}

export function isWActive(pathname: string, href: string): boolean {
  return href === '/w' ? pathname === '/w' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Kỳ của Workspace: 7 / 14 / 30 ngày như Madgicx (dùng chung cookie kỳ với giao diện cổ điển). */
export const W_PERIODS = ['last7', 'last14', 'last30'] as const;
