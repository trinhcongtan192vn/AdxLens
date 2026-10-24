import { NAV_ITEMS, type NavKey } from './nav';

export type Crumb = { key: string; ns: 'nav' | 'settings' | 'pages' };

const SETTINGS_TABS = ['workspace', 'members', 'billing', 'notifications', 'profile', 'guardrails'];
const PAGES = ['notifications', 'support', 'onboarding'];

/**
 * Breadcrumb trên thanh trên theo đường dẫn: "<mục sidebar> › <tab>" (Penpot X07: "Cài đặt › Hồ sơ cá
 * nhân"). Trang chi tiết tự hiển thị tên đối tượng trong PageHeader.
 */
export function breadcrumbFor(pathname: string): Crumb[] {
  const [first, second] = pathname.split('/').filter(Boolean);
  if (!first) return [];
  const nav = NAV_ITEMS.find((i) => i.href === `/${first}`);
  if (nav) {
    const out: Crumb[] = [{ key: nav.key satisfies NavKey, ns: 'nav' }];
    if (first === 'settings' && second && SETTINGS_TABS.includes(second)) {
      out.push({ key: second, ns: 'settings' });
    }
    return out;
  }
  if (PAGES.includes(first)) return [{ key: first, ns: 'pages' }];
  return [];
}
