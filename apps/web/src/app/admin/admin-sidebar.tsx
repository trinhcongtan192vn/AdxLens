'use client';

import {
  Activity,
  Building2,
  CalendarCheck,
  CreditCard,
  FileClock,
  Flag,
  GitCompareArrows,
  Lock,
  Mail,
  OctagonX,
  ServerCog,
  ShieldAlert,
  Siren,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { navItemClass } from '@adxlens/ui';
import { ADMIN_NAV, badgeTone, isAdminNavActive, type AdminInboxKey, type AdminNavKey } from '@/lib/admin-nav';

const ICONS: Record<AdminNavKey, LucideIcon> = {
  today: CalendarCheck,
  workspaces: Building2,
  incidents: Siren,
  operations: Activity,
  reconciliation: GitCompareArrows,
  execution: ShieldAlert,
  killSwitch: OctagonX,
  flags: Flag,
  billing: CreditCard,
  deletions: Trash2,
  audit: FileClock,
  staff: Users,
  emails: Mail,
  system: ServerCog,
};

/**
 * Sidebar admin theo luồng việc của operator: Hôm nay → Khách hàng → Vận hành dữ liệu → An toàn thực thi → Phát hành →
 * Doanh thu → Tuân thủ → Cấu hình. Số cạnh mục là việc đang chờ (đỏ = khẩn); kill switch hiện trạng thái; mục chỉ
 * superadmin thao tác được có khóa khi người xem là operator (vẫn mở để xem).
 */
export function AdminSidebar({
  counts,
  total,
  killSwitchActive,
  role,
}: {
  counts: Record<AdminInboxKey, { count: number; urgent: boolean }>;
  total: number;
  killSwitchActive: boolean;
  role: 'superadmin' | 'operator';
}) {
  const t = useTranslations('admin');
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label={t('navLabel')} className="flex flex-col gap-3 p-3" data-testid="admin-sidebar">
      {ADMIN_NAV.map((g, gi) => (
        <div key={g.key ?? gi} className="flex flex-col gap-0.5">
          {g.key ? (
            <p className="px-2 pb-1 text-caption font-semibold uppercase tracking-wide text-fg-tertiary">
              {t(`groups.${g.key}`)}
            </p>
          ) : null}
          {g.items.map((item) => {
            const Icon = ICONS[item.key];
            const active = isAdminNavActive(item.href, pathname);
            const c =
              item.key === 'today' ? { count: total, urgent: false } : item.badge ? counts[item.badge] : undefined;
            const tone = badgeTone(c);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={navItemClass(active)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden />
                <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
                {item.superadminOnly && role !== 'superadmin' ? (
                  <Lock className="size-3.5 text-fg-tertiary" aria-label={t('superadminOnly')} />
                ) : null}
                {item.key === 'killSwitch' ? (
                  <span
                    className={`rounded-full px-1.5 text-caption font-semibold ${killSwitchActive ? 'bg-danger text-fg-inverse' : 'bg-subtle text-fg-tertiary'}`}
                  >
                    {killSwitchActive ? t('ksShort.on') : t('ksShort.off')}
                  </span>
                ) : null}
                {tone ? (
                  <span
                    className={`num min-w-5 rounded-full px-1.5 text-center text-caption font-semibold ${tone === 'danger' ? 'bg-danger text-fg-inverse' : 'bg-subtle text-fg-secondary'}`}
                    data-testid={`admin-badge-${item.key}`}
                  >
                    {c!.count > 99 ? '99+' : c!.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
