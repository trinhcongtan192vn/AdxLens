'use client';

import {
  Bell,
  Bot,
  Briefcase,
  ChartColumnBig,
  Filter,
  Globe,
  House,
  LayoutGrid,
  LayoutPanelLeft,
  Plus,
  Rows3,
  Settings,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn, Menu } from '@adxlens/ui';
import { isWActive, type WNavItem, type WNavKey } from '@/lib/workspace-nav';

const ICONS: Record<WNavKey, LucideIcon> = {
  home: House,
  agents: Bot,
  business: Briefcase,
  ads: LayoutGrid,
  adsManager: Rows3,
  funnels: Filter,
  geography: Globe,
  scale: ChartColumnBig,
  audiences: UsersRound,
  alerts: Bell,
};

export type CreateItem = { key: 'report' | 'manageAds' | 'agent' | 'alert' | 'rule'; href: string };

/**
 * Sidebar giao diện Workspace (bố cục theo Madgicx Workspace, thương hiệu AdxLens): nút Tạo, trang chính, đáy là
 * Alert / Cài đặt / chuyển về giao diện cổ điển.
 */
export function WsSidebar({
  items,
  bottom,
  create,
  workspaceName,
  unread,
}: {
  items: WNavItem[];
  bottom: WNavItem[];
  create: CreateItem[];
  workspaceName: string;
  unread: number;
}) {
  const t = useTranslations('ws');
  const pathname = usePathname() ?? '/w';
  const router = useRouter();
  const link = (i: WNavItem) => {
    const Icon = ICONS[i.key];
    const active = isWActive(pathname, i.href);
    return (
      <Link
        key={i.key}
        href={i.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-9 items-center gap-3 rounded-lg px-3 text-body transition-colors',
          active ? 'bg-brand-subtle font-semibold text-brand' : 'text-fg-secondary hover:bg-hover hover:text-fg',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{t(`nav.${i.key}`)}</span>
        {i.key === 'alerts' && unread > 0 ? (
          <span className="num ml-auto rounded-full bg-danger px-1.5 text-caption text-fg-inverse">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Link>
    );
  };
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4">
      <Link href="/w" className="flex items-center gap-2 px-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-on-brand">
          <TrendingUp className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-h4 font-semibold leading-tight text-fg">AdxLens</span>
          <span className="block truncate text-caption text-fg-tertiary">{workspaceName}</span>
        </span>
      </Link>

      <Menu.Root>
        <Menu.Trigger
          className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand text-body font-medium text-on-brand hover:bg-brand-hover"
          data-testid="ws-create"
        >
          <Plus className="size-4" aria-hidden />
          {t('create.button')}
        </Menu.Trigger>
        <Menu.Content className="w-64">
          {create.map((c) => (
            <Menu.Item key={c.key} onSelect={() => router.push(c.href)}>
              <span className="flex flex-col">
                <span className="text-body text-fg">{t(`create.${c.key}.title`)}</span>
                <span className="text-caption text-fg-tertiary">{t(`create.${c.key}.body`)}</span>
              </span>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>

      <nav className="mt-4 flex flex-col gap-0.5" aria-label={t('nav.label')}>
        {items.map(link)}
      </nav>
      <div className="flex-1" />
      <nav className="flex flex-col gap-0.5 border-t border-line pt-3">
        {bottom.map(link)}
        <Link
          href="/settings"
          className="flex h-9 items-center gap-3 rounded-lg px-3 text-body text-fg-secondary hover:bg-hover hover:text-fg"
        >
          <Settings className="size-4" aria-hidden />
          {t('nav.settings')}
        </Link>
        <Link
          href="/overview"
          data-testid="switch-classic"
          className="flex h-9 items-center gap-3 rounded-lg px-3 text-body text-fg-secondary hover:bg-hover hover:text-fg"
        >
          <LayoutPanelLeft className="size-4" aria-hidden />
          {t('nav.classic')}
        </Link>
      </nav>
    </aside>
  );
}
