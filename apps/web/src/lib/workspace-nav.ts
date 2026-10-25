import type { FlagKey } from '@adxlens/core/flags';
import type { Role } from '@adxlens/core/shared';
import { visibleNav, type NavKey } from './nav';

/** Khung Workspace — khung duy nhất của app (bố cục theo Madgicx Workspace). */
export const W_SCOPE_COOKIE = 'w_scope';
/** 4 KPI trang chủ, nối bằng dấu chấm. */
export const W_KPIS_COOKIE = 'w_kpis';
export const W_BASE = '/w';

export type WNavKey =
  | 'home'
  | 'agents'
  | 'business'
  | 'ads'
  | 'adsManager'
  | 'funnels'
  | 'geography'
  | 'scale'
  | 'audiences'
  | 'launcher'
  | 'alerts';

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
  { key: 'launcher', href: '/w/launcher', flag: 'p2a_approve' },
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

/** Mục của khung chung: nhãn lấy từ `ws.nav.*` (trang Workspace) hoặc `nav.*` (trang có từ giao diện cũ). */
export type ShellItem = { key: string; href: string; ns: 'ws.nav' | 'nav' };
export type ShellGroupKey = 'analysis' | 'clients' | 'execution';
export type ShellGroup = { key: ShellGroupKey; items: ShellItem[] };

const ANALYSIS: WNavKey[] = ['home', 'business', 'ads', 'adsManager', 'funnels', 'geography', 'scale', 'audiences'];
const CLIENT_KEYS: NavKey[] = ['clients', 'reports', 'weeklyActions', 'creatives'];

/**
 * Sidebar duy nhất của app (gộp giao diện cổ điển vào khung Workspace): 3 nhóm + đáy. Cờ và vai trò lấy từ `W_NAV` /
 * `NAV_ITEMS` nên quy tắc ẩn mục giữ nguyên (CLAUDE.md quy tắc 7).
 */
export function shellNav(flags: Record<FlagKey, boolean>, role: Role): { groups: ShellGroup[]; bottom: ShellItem[] } {
  const ws = (k: WNavKey): ShellItem[] =>
    visibleWNav(W_NAV, flags)
      .filter((i) => i.key === k)
      .map((i) => ({ key: i.key, href: i.href, ns: 'ws.nav' }));
  const nav = (k: NavKey): ShellItem[] =>
    visibleNav(flags, role)
      .filter((i) => i.key === k)
      .map((i) => ({ key: i.key, href: i.href, ns: 'nav' }));
  const groups: ShellGroup[] = [
    { key: 'analysis' as const, items: ANALYSIS.flatMap(ws) },
    { key: 'clients' as const, items: CLIENT_KEYS.flatMap(nav) },
    {
      key: 'execution' as const,
      items: [...ws('agents'), ...ws('launcher'), ...nav('automation'), ...nav('actionLog')],
    },
  ].filter((g) => g.items.length > 0);
  const bottom: ShellItem[] = [
    ...visibleWNav(W_NAV_BOTTOM, flags).map((i) => ({ key: i.key, href: i.href, ns: 'ws.nav' as const })),
    ...nav('connections'),
    ...nav('settings'),
  ];
  return { groups, bottom };
}
