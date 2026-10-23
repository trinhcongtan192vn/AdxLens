import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Badge } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';

export async function generateMetadata() {
  return { robots: { index: false, follow: false } };
}

/** Khung trang nội bộ (Penpot AD01–AD04): "AdxLens Admin · Nội bộ", email + vai trò. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, staff } = await requireStaff();
  const t = await getTranslations('admin');
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-12 items-center gap-3 border-b border-line bg-surface px-6">
        <span className="text-h3 font-semibold text-brand">{t('brand')}</span>
        <Badge tone="warning">{t('internal')}</Badge>
        <nav className="ml-6 flex gap-4 text-body">
          <Link href="/admin/workspaces" className="text-fg-secondary hover:text-fg">
            {t('nav.workspaces')}
          </Link>
          <Link href="/admin/flags" className="text-fg-secondary hover:text-fg">
            {t('nav.flags')}
          </Link>
          <Link href="/admin/incidents" className="text-fg-secondary hover:text-fg">
            {t('nav.incidents')}
          </Link>
          <Link href="/admin/kill-switch" className="text-fg-secondary hover:text-fg">
            {t('nav.killSwitch')}
          </Link>
          <Link href="/admin/staff" className="text-fg-secondary hover:text-fg">
            {t('nav.staff')}
          </Link>
          <Link href="/admin/audit" className="text-fg-secondary hover:text-fg">
            {t('nav.audit')}
          </Link>
        </nav>
        <div className="flex-1" />
        <span className="text-small text-fg-secondary">
          {user.email} · {t(`roles.${staff.role}`)}
        </span>
      </header>
      <main className="px-6 py-4">{children}</main>
    </div>
  );
}
