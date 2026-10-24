import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Badge, Banner } from '@adxlens/ui';
import { adminInboxForRequest, requireStaff } from '@/server/admin-context';
import { AdminSidebar } from './admin-sidebar';

export async function generateMetadata() {
  return { robots: { index: false, follow: false } };
}

/**
 * Khung trang nội bộ (Penpot AD01–AD04): thanh trên "AdxLens Admin · Nội bộ" + email, vai trò; sidebar theo luồng việc
 * kèm số việc đang chờ; banner đỏ trên mọi trang khi kill switch toàn cục đang bật.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, staff } = await requireStaff();
  const t = await getTranslations('admin');
  const inbox = await adminInboxForRequest();
  const counts = Object.fromEntries(
    Object.entries(inbox.items).map(([k, v]) => [k, { count: v.count, urgent: v.urgent }]),
  ) as Parameters<typeof AdminSidebar>[0]['counts'];
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href="/admin" className="text-h3 font-semibold text-brand">
          {t('brand')}
        </Link>
        <Badge tone="warning">{t('internal')}</Badge>
        <div className="flex-1" />
        <span className="text-small text-fg-secondary">
          {user.email} · {t(`roles.${staff.role}`)}
        </span>
      </header>
      <div className="flex">
        <aside className="sticky top-12 h-[calc(100vh-3rem)] w-60 shrink-0 overflow-y-auto border-r border-line bg-surface">
          <AdminSidebar
            counts={counts}
            total={inbox.total}
            killSwitchActive={inbox.killSwitch.active}
            role={staff.role}
          />
        </aside>
        <main className="min-w-0 flex-1 px-6 py-4">
          {inbox.killSwitch.active ? (
            <Banner tone="danger" className="mb-4" title={t('ksBanner.title')}>
              {t('ksBanner.body', { reason: inbox.killSwitch.reason ?? '—' })}{' '}
              <Link href="/admin/kill-switch" className="text-link underline">
                {t('ksBanner.link')}
              </Link>
            </Banner>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
