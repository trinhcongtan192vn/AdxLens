'use client';

import {
  Building2,
  FileText,
  History,
  Image,
  LayoutDashboard,
  Lightbulb,
  Plug,
  Settings,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { navItemClass } from '@adxlens/ui';
import { isActive, type NavItem } from '@/lib/nav';

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

/** Sidebar 224px dưới thanh trên (Penpot O01). */
export function Sidebar({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <aside className="sticky top-12 h-[calc(100vh-3rem)] w-56 shrink-0 border-r border-line bg-surface">
      <nav aria-label={t('mainNav')} className="flex flex-col gap-0 p-2">
        {items.map((item) => {
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
        })}
      </nav>
    </aside>
  );
}
