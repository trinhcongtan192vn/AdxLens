'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { breadcrumbFor } from '@/lib/breadcrumb';
import { PERIODS, type Period } from '@/lib/period';

/**
 * Đầu trang cho các trang có từ giao diện cổ điển (trong khung chung): breadcrumb + chọn kỳ. Trang `/w/*` tự có đầu
 * trang riêng (WsHeader) nên không hiện.
 */
export function PageToolbar({ period }: { period: Period }) {
  const t = useTranslations();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [pending, start] = useTransition();
  if (pathname === '/w' || pathname.startsWith('/w/')) return null;
  const crumbs = breadcrumbFor(pathname);
  return (
    <div className="mb-3 flex items-center gap-3 print:hidden" aria-busy={pending} data-testid="page-toolbar">
      <nav aria-label="breadcrumb" className="min-w-0 flex-1 truncate text-body text-fg-tertiary">
        {crumbs.map((c, i) => (
          <span key={c.key}>
            {i > 0 ? <span className="px-1">›</span> : null}
            {t(`${c.ns}.${c.key}`)}
          </span>
        ))}
      </nav>
      <Select
        className="w-50"
        value={period}
        onChange={(e) =>
          start(async () => {
            await api('me/preferences', { method: 'POST', body: { period: e.target.value } });
            router.refresh();
          })
        }
        aria-label={t('shell.period')}
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {t(`shell.periods.${p}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}
