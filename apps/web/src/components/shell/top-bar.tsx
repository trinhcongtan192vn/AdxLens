'use client';

import { Check, ChevronDown, Plus, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Menu, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { breadcrumbFor } from '@/lib/breadcrumb';
import { PERIODS, type Period } from '@/lib/period';
import { clientScopeOf } from '@/lib/scope';

type Ws = { id: string; name: string; role?: 'owner' | 'manager' | 'buyer' };

function initials(fullName: string | null, email: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return (parts[0] ?? email).slice(0, 2).toUpperCase();
}

/** Thanh trên toàn chiều ngang (Penpot O01/X07): logo + breadcrumb · kỳ · workspace · avatar. */
export function TopBar({
  period,
  workspaces,
  currentWorkspaceId,
  user,
  locale,
  unread,
  clients = [],
  accountClients = {},
}: {
  period: Period;
  workspaces: Ws[];
  currentWorkspaceId: string;
  user: { email: string; fullName: string | null };
  locale: 'vi' | 'en';
  unread: number;
  /** G3: bộ chọn khách (như chọn tài khoản trong Google Ads). */
  clients?: { id: string; name: string }[];
  accountClients?: Record<string, string | null>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const crumbs = breadcrumbFor(pathname);
  const search = useSearchParams()?.toString() ?? '';
  const scopeClient = clientScopeOf(pathname, search, accountClients);

  const setPref = (body: Record<string, string>) =>
    start(async () => {
      await api('me/preferences', { method: 'POST', body });
      router.refresh();
    });

  const switchWorkspace = (workspaceId: string) =>
    start(async () => {
      await api('me/workspace', { method: 'POST', body: { workspaceId } });
      router.push('/overview');
      router.refresh();
    });

  const otherLocale = locale === 'vi' ? 'en' : 'vi';
  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  return (
    <header
      className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-surface px-4"
      aria-busy={pending}
    >
      <Link href="/overview" className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-brand text-on-brand">
          <TrendingUp className="size-4" aria-hidden />
        </span>
        <span className="text-h2 font-semibold text-brand">AdxLens</span>
      </Link>
      {crumbs.length ? (
        <nav aria-label="breadcrumb" className="text-body text-fg-tertiary">
          {crumbs.map((c, i) => (
            <span key={c.key}>
              {i > 0 ? <span className="px-1">›</span> : null}
              {t(`${c.ns}.${c.key}`)}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex-1" />

      {clients.length ? (
        <Select
          className="w-56"
          value={scopeClient ?? ''}
          onChange={(e) => router.push(e.target.value ? `/clients/${e.target.value}` : '/overview')}
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

      <Select
        className="w-50"
        value={period}
        onChange={(e) => setPref({ period: e.target.value })}
        aria-label={t('shell.period')}
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {t(`shell.periods.${p}`)}
          </option>
        ))}
      </Select>

      {/* Bộ chọn workspace (như Slack / Notion): danh sách kèm vai trò, cuối là "+ Tạo workspace mới". */}
      <Menu.Root>
        <Menu.Trigger
          aria-label={t('shell.switchWorkspace')}
          data-testid="workspace-switcher"
          className="flex h-8 w-50 items-center gap-1 rounded-md border border-line bg-surface px-2 text-body text-fg hover:bg-subtle"
        >
          <span className="flex-1 truncate text-left">{current?.name ?? ''}</span>
          <ChevronDown className="size-4 text-fg-tertiary" aria-hidden />
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

      <Menu.Root>
        <Menu.Trigger
          aria-label={t('shell.accountMenu')}
          className="relative flex size-7 items-center justify-center rounded-full bg-brand-subtle text-caption font-semibold text-brand"
        >
          {initials(user.fullName, user.email)}
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-danger" aria-hidden />
          ) : null}
        </Menu.Trigger>
        <Menu.Content className="w-60">
          <div className="px-2 py-1.5">
            {user.fullName ? <p className="text-body font-medium text-fg">{user.fullName}</p> : null}
            <p className="truncate text-small text-fg-tertiary">{user.email}</p>
          </div>
          <Menu.Separator />
          <Menu.Item onSelect={() => router.push('/settings/profile')}>{t('shell.profile')}</Menu.Item>
          <Menu.Item onSelect={() => router.push('/notifications')}>
            <span className="flex-1">{t('shell.notifications')}</span>
            {unread > 0 ? (
              <span className="num rounded-full bg-danger px-1.5 text-caption text-fg-inverse">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Menu.Item>
          <Menu.Item onSelect={() => setPref({ locale: otherLocale })}>
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
    </header>
  );
}
