'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** AD03: đánh dấu đã giảm thiểu / đã xử lý. */
export function IncidentActions({ id, status }: { id: string; status: 'open' | 'mitigated' | 'resolved' }) {
  const t = useTranslations('admin.incidents');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (s: 'mitigated' | 'resolved') =>
    start(async () => {
      try {
        await api(`admin/incidents/${id}`, { method: 'POST', body: { status: s } });
        toast.success(t('updated'));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  return (
    <span className="flex gap-2">
      {status === 'open' ? (
        <Button kind="secondary" size="s" disabled={pending} onClick={() => set('mitigated')}>
          {t('mitigate')}
        </Button>
      ) : null}
      <Button kind="primary" size="s" disabled={pending} onClick={() => set('resolved')}>
        {t('resolve')}
      </Button>
    </span>
  );
}
