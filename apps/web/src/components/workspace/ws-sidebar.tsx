'use client';

import {
  Bell,
  Bot,
  Briefcase,
  Building2,
  ChartColumnBig,
  Check,
  ChevronsUpDown,
  FileText,
  Filter,
  Globe,
  History,
  House,
  Image,
  LayoutGrid,
  Lightbulb,
  Plug,
  Plus,
  Rocket,
  Rows3,
  Settings,
  TrendingUp,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { cn, Menu, Select } from '@adxlens/ui';
import type { Role } from '@adxlens/core/shared';
import { api } from '@/lib/api-client';
import { isWActive, type ShellGroup, type ShellItem } from '@/lib/workspace-nav';

const ICONS: Record<string, LucideIcon> = {
  home: House,
  agents: Bot,
  business: Briefcase,
  ads: LayoutGrid,
  adsManager: Rows3,
  funnels: Filter,
  geography: Globe,
  scale: ChartColumnBig,
  audiences: UsersRound,
  launcher: Rocket,
  alerts: Bell,
  clients: Building2,
  reports: FileText,
  weeklyActions: Lightbulb,
  creatives: Image,
  actionLog: History,
  automation: Zap,
  connections: Plug,
  settings: Settings,
};

export type CreateItem = { key: 'report' | 'manageAds' | 'agent' | 'alert' | 'rule'; href: string };
type Ws = { id: string; name: string; role?: Role };

function initials(fullName: string | null, email: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return (parts[0] ?? email).slice(0, 2).toUpperCase();
}

const itemClass = (active: boolean) =>
  cn(
    'flex h-9 items-center gap-3 rounded-lg px-3 text-body transition-colors',
    active ? 'bg-brand-subtle font-semibold text-brand' : 'text-fg-secondary hover:bg-hover hover:text-fg',
  );

/**
 * Sidebar duy nhất của app (bố cục Madgicx Workspace, thương hiệu AdxLens). Đầu: chọn workspace, chọn khách, nút Tạo.
 * Giữa: 3 nhóm (Phân tích · Khách & báo cáo · Thực thi) — luôn một bộ menu, chọn Client chỉ lọc dữ liệu. Đáy: Cảnh
 * báo, Kết nối, Cài đặt, menu tài khoản (hồ sơ, thông báo, ngôn ngữ, đăng xuất).
 */
export function WsSidebar({
  groups,
  bottom,
  create,
  workspaces,
  currentWorkspaceId,
  user,
  locale,
  unread,
  clients,
  currentClient,
}: {
  groups: ShellGroup[];
  bottom: ShellItem[];
  create: CreateItem[];
  workspaces: Ws[];
  currentWorkspaceId: string;
  user: { email: string; fullName: string | null };
  locale: 'vi' | 'en';
  unread: number;
  clients: { id: string; name: string }[];
  /** Client đang xem (cookie `w_client`); null = mọi Client. */
  currentClient: string | null;
}) {
  const t = useTranslations();
  const pathname = usePathname() ?? '/w';
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  const setPref = (body: Record<string, string>) =>
    start(async () => {
      await api('me/preferences', { method: 'POST', body });
      router.refresh();
    });
  const switchWorkspace = (workspaceId: string) =>
    start(async () => {
      await api('me/workspace', { method: 'POST', body: { workspaceId } });
      router.push('/w');
      router.refresh();
    });

  const link = (i: ShellItem) => {
    const Icon = ICONS[i.key] ?? LayoutGrid;
    const active = isWActive(pathname, i.href);
    return (
      <Link key={i.key} href={i.href} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{t(`${i.ns}.${i.key}`)}</span>
        {i.key === 'alerts' && unread > 0 ? (
          <span className="num ml-auto rounded-full bg-danger px-1.5 text-caption text-fg-inverse">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <aside
      className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 print:hidden"
      aria-busy={pending}
    >
      {/* Logo + bộ chọn workspace (như Slack / Notion): danh sách kèm vai trò, cuối là "+ Tạo workspace mới". */}
      <Menu.Root>
        <Menu.Trigger
          aria-label={t('shell.switchWorkspace')}
          data-testid="workspace-switcher"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-hover"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand text-on-brand">
            <TrendingUp className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-h4 font-semibold leading-tight text-fg">AdxLens</span>
            <span className="block truncate text-caption text-fg-tertiary">{current?.name ?? ''}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
        </Menu.Trigger>
        <Menu.Content className="w-64">
          <Menu.Label>{t('shell.workspaces')}</Menu.Label>
          <div className="max-h-72 overflow-y-auto">
            {workspaces.map((w) => (
              <Menu.Item key={w.id} onSelect={() => w.id !== currentWorkspaceId && switchWorkspace(w.id)}>
                <span className="w-4">{w.id === currentWorkspaceId ? <Check aria-hidden /> : null}</span>
                <span className="flex-1 truncate">{w.name}</span>
                {w.role ? <span className="text-caption text-fg-tertiary">{t(`shell.roles.${w.role}`)}</span> : null}
              </Menu.Item>
            ))}
          </div>
          <Menu.Separator />
          <Menu.Item onSelect={() => router.push('/onboarding/workspace')}>
            <Plus aria-hidden />
            {t('shell.newWorkspace')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Root>

      {/* Chọn Client ở MỘT nơi: lọc dữ liệu mọi trang, sidebar không đổi (PM 25/10). */}
      {clients.length ? (
        <Select
          className="mt-3 w-full"
          value={currentClient ?? ''}
          onChange={(e) => setPref({ wClient: e.target.value || 'all' })}
          aria-label={t('shell.switchClient')}
          data-testid="client-switcher"
        >
          <option value="">{t('shell.allClients')}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      ) : null}

      <Menu.Root>
        <Menu.Trigger
          className="mt-3 flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-brand text-body font-medium text-on-brand hover:bg-brand-hover"
          data-testid="ws-create"
        >
          <Plus className="size-4" aria-hidden />
          {t('ws.create.button')}
        </Menu.Trigger>
        <Menu.Content className="w-64">
          {create.map((c) => (
            <Menu.Item key={c.key} onSelect={() => router.push(c.href)}>
              <span className="flex flex-col">
                <span className="text-body text-fg">{t(`ws.create.${c.key}.title`)}</span>
                <span className="text-caption text-fg-tertiary">{t(`ws.create.${c.key}.body`)}</span>
              </span>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>

      <nav
        className="-mx-1 mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1"
        aria-label={t('nav.mainNav')}
        data-testid="agency-nav"
      >
        {groups.map((g, gi) => (
          <div key={g.key} className={cn('flex flex-col gap-0.5', gi > 0 && 'mt-3')}>
            <p className="px-3 pb-1 text-caption font-semibold uppercase text-fg-tertiary">
              {t(`ws.navGroups.${g.key}`)}
            </p>
            {g.items.map(link)}
          </div>
        ))}
      </nav>

      <nav className="mt-3 flex shrink-0 flex-col gap-0.5 border-t border-line pt-3" aria-label={t('ws.nav.more')}>
        {bottom.map(link)}
        <Menu.Root>
          <Menu.Trigger
            aria-label={t('shell.accountMenu')}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hover"
          >
            <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-caption font-semibold text-brand">
              {initials(user.fullName, user.email)}
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-danger" aria-hidden />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-small text-fg-secondary">{user.fullName ?? user.email}</span>
          </Menu.Trigger>
          <Menu.Content className="w-60">
            <div className="px-2 py-1.5">
              {user.fullName ? <p className="text-body font-medium text-fg">{user.fullName}</p> : null}
              <p className="truncate text-small text-fg-tertiary">{user.email}</p>
            </div>
            <Menu.Separator />
            <Menu.Item onSelect={() => router.push('/settings/profile')}>{t('shell.profile')}</Menu.Item>
            <Menu.Item onSelect={() => router.push('/w/alerts')}>
              <span className="flex-1">{t('shell.notifications')}</span>
              {unread > 0 ? (
                <span className="num rounded-full bg-danger px-1.5 text-caption text-fg-inverse">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </Menu.Item>
            <Menu.Item onSelect={() => setPref({ locale: locale === 'vi' ? 'en' : 'vi' })}>
              {t('shell.languageItem', { language: t(`shell.languages.${locale}`) })}
            </Menu.Item>
            <Menu.Separator />
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                className="flex h-8 w-full items-center rounded-sm px-2 text-body text-danger hover:bg-subtle"
              >
                {t('shell.logout')}
              </button>
            </form>
          </Menu.Content>
        </Menu.Root>
      </nav>
    </aside>
  );
}
