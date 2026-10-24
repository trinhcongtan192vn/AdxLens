'use client';

import {
  ArrowLeft,
  Building2,
  FileText,
  GitCompareArrows,
  History,
  Image,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Plug,
  Settings,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { navItemClass } from '@adxlens/ui';
import type { FlagKey } from '@adxlens/core/flags';
import type { Role } from '@adxlens/core/shared';
import { isActive, type NavItem } from '@/lib/nav';
import { clientNav, clientScopeOf, isClientNavActive, type ClientNavKey } from '@/lib/scope';

/** Icon theo khung O01 trong Penpot. */
const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  clients: Building2,
  reports: FileText,
  weeklyActions: Lightbulb,
  creatives: Image,
  actionLog: History,
  automation: Zap,
  connections: Plug,
  settings: Settings,
};
const CLIENT_ICONS: Record<ClientNavKey, LucideIcon> = {
  campaigns: Megaphone,
  adsets: Layers,
  ads: Image,
  reconciliation: GitCompareArrows,
  reports: FileText,
  weeklyActions: Lightbulb,
  creatives: Image,
  automation: Zap,
  actionLog: History,
  clientSettings: SlidersHorizontal,
};

/**
 * Sidebar 224px dưới thanh trên (Penpot O01). G3: hai phạm vi như Google Ads — phạm vi agency (mọi khách) và phạm vi
 * một Client (khi đang ở trang Client, tài khoản / chiến dịch của Client, hoặc danh sách lọc `?client=`).
 */
export function Sidebar({
  items,
  flags,
  role,
  clients,
  accountClients,
}: {
  items: NavItem[];
  flags: Record<FlagKey, boolean>;
  role: Role;
  clients: { id: string; name: string }[];
  accountClients: Record<string, string | null>;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const clientId = clientScopeOf(pathname, search, accountClients);
  const client = clientId ? clients.find((c) => c.id === clientId) : null;

  return (
    <aside className="sticky top-12 h-[calc(100vh-3rem)] w-56 shrink-0 overflow-y-auto border-r border-line bg-surface">
      <nav
        aria-label={t('mainNav')}
        className="flex flex-col gap-0 p-2"
        data-testid={client ? 'client-nav' : 'agency-nav'}
      >
        {client ? (
          <>
            <Link href="/overview" className={navItemClass(false)}>
              <ArrowLeft aria-hidden />
              <span className="truncate">{t('allClients')}</span>
            </Link>
            <Link
              href={`/clients/${client.id}`}
              className="mx-2 mb-1 mt-2 truncate text-small font-semibold uppercase text-fg-tertiary hover:text-fg"
              title={client.name}
            >
              {client.name}
            </Link>
            {clientNav(client.id, flags, role).map((item) => {
              const Icon = CLIENT_ICONS[item.key];
              const active = isClientNavActive(item, pathname, search ? `?${search}` : '');
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={navItemClass(active)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon aria-hidden />
                  <span className="truncate">{t(`client.${item.key}`)}</span>
                </Link>
              );
            })}
          </>
        ) : (
          items.map((item) => {
            const Icon = ICONS[item.key] ?? LayoutDashboard;
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={navItemClass(active)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden />
                <span className="truncate">{t(item.key)}</span>
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
