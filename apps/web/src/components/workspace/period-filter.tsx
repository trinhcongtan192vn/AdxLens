'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Segmented } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { W_PERIODS } from '@/lib/workspace-nav';

/**
 * Bộ lọc kỳ 7 / 14 / 30 ngày (PM 25/10: đặt sát vùng dữ liệu nó tác động, không nằm ở đầu mọi trang). Lưu theo người
 * dùng (cookie kỳ chung).
 */
export function PeriodFilter({ period }: { period: string }) {
  const t = useTranslations('ws');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      role="group"
      aria-label={t('periodLabel')}
      aria-busy={pending}
      className="print:hidden"
      data-testid="period-filter"
    >
      <Segmented
        value={(W_PERIODS as readonly string[]).includes(period) ? period : 'last7'}
        onChange={(v: string) =>
          start(async () => {
            await api('me/preferences', { method: 'POST', body: { period: v } });
            router.refresh();
          })
        }
        options={W_PERIODS.map((p) => ({ value: p, label: t(`periods.${p}`) }))}
      />
    </div>
  );
}
