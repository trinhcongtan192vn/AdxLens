// Phạm vi đang xem (G3, như Google Ads: tài khoản quản lý ↔ một khách). Hàm thuần để test được.
import type { FlagKey } from '@adxlens/core/flags';
import type { Role } from '@adxlens/core/shared';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Client đang xem: `/clients/{id}…`, `?client={id}` ở các trang danh sách, hoặc trang tài khoản / chiến dịch thuộc
 * một Client (`/accounts/{id}…`, tra theo bản đồ tài khoản → Client). Không thuộc Client nào → null (phạm vi agency).
 */
export function clientScopeOf(
  pathname: string,
  search: string,
  accountClients: Record<string, string | null>,
): string | null {
  const c = new RegExp(`^/clients/(${UUID})(?:/|$)`).exec(pathname);
  if (c) return c[1]!;
  const q = new URLSearchParams(search).get('client');
  if (q && new RegExp(`^${UUID}$`).test(q)) return q;
  const a = new RegExp(`^/accounts/(${UUID})(?:/|$)`).exec(pathname);
  if (a) return accountClients[a[1]!] ?? null;
  return null;
}

export type ClientNavKey =
  | 'campaigns'
  | 'adsets'
  | 'ads'
  | 'reconciliation'
  | 'reports'
  | 'weeklyActions'
  | 'creatives'
  | 'automation'
  | 'actionLog'
  | 'clientSettings';

export type ClientNavItem = { key: ClientNavKey; href: string; flag?: FlagKey; roles?: Role[] };

/** Mục sidebar khi đang xem một Client; mục P1/P2 chỉ khi cờ bật (CLAUDE.md quy tắc 7). */
export function clientNav(clientId: string, flags: Record<FlagKey, boolean>, role: Role): ClientNavItem[] {
  const base = `/clients/${clientId}`;
  const items: ClientNavItem[] = [
    { key: 'campaigns', href: `${base}?tab=campaigns` },
    { key: 'adsets', href: `${base}?tab=adsets` },
    { key: 'ads', href: `${base}?tab=ads` },
    { key: 'reconciliation', href: `${base}/reconciliation` },
    { key: 'reports', href: `${base}?tab=reports`, flag: 'p0_reports', roles: ['owner', 'manager'] },
    { key: 'weeklyActions', href: `/weekly-actions?client=${clientId}`, flag: 'p1_recommendations' },
    { key: 'creatives', href: `/creatives?client=${clientId}`, flag: 'p1_recommendations' },
    { key: 'automation', href: `/automation?client=${clientId}`, flag: 'p2b_auto' },
    { key: 'actionLog', href: `/action-log?client=${clientId}`, flag: 'p2a_approve' },
    { key: 'clientSettings', href: `${base}?tab=settings` },
  ];
  return items.filter((i) => (!i.flag || flags[i.flag]) && (!i.roles || i.roles.includes(role)));
}

/** Mục nào đang được chọn (so đường dẫn + tham số tab / client). */
export function isClientNavActive(item: ClientNavItem, pathname: string, search: string): boolean {
  const [path, query = ''] = item.href.split('?');
  if (pathname !== path) return false;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(search);
  if (want.has('tab')) return (have.get('tab') ?? 'campaigns') === want.get('tab');
  return true;
}

/**
 * Phạm vi Workspace (PM 25/10: chọn Client ở một nơi): Client đang xem (lạ / không được xem → mọi Client) → tài khoản
 * trong Client; tài khoản đang chọn phải thuộc Client đó; không chọn tài khoản → các tài khoản cùng tiền tệ chính (không
 * cộng khác tiền tệ).
 */
export function pickScope<A extends { id: string; clientId: string | null; currency: string }>(
  visible: A[],
  wantClient: string | undefined,
  wantAccount: string | undefined,
) {
  const clientId = visible.some((a) => a.clientId !== null && a.clientId === wantClient) ? wantClient! : null;
  const accounts = clientId ? visible.filter((a) => a.clientId === clientId) : visible;
  const selected = accounts.find((a) => a.id === wantAccount) ?? null;
  const count = new Map<string, number>();
  for (const a of accounts) count.set(a.currency, (count.get(a.currency) ?? 0) + 1);
  const main = [...count].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const inScope = selected ? [selected] : accounts.filter((a) => a.currency === main);
  return { clientId, accounts, selected, inScope, main };
}
