'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** P211/P214: tạm dừng, quay về shadow, bật live (khi đủ điều kiện), xóa. */
export function RuleModeActions({
  id,
  mode,
  liveBlocker,
}: {
  id: string;
  mode: 'shadow' | 'live' | 'paused';
  liveBlocker: string | null;
}) {
  const t = useTranslations('automation');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (m: 'shadow' | 'live' | 'paused') =>
    start(async () => {
      if (m === 'live' && !window.confirm(t('liveConfirm'))) return;
      try {
        await api(`automation-rules/${id}/mode`, { method: 'POST', body: { mode: m } });
        toast.success(t(`modeSet.${m}`));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  const remove = () =>
    start(async () => {
      if (!window.confirm(t('deleteConfirm'))) return;
      try {
        await api(`automation-rules/${id}`, { method: 'DELETE' });
        router.push('/automation');
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  return (
    <span className="flex flex-wrap gap-2">
      {mode !== 'live' ? (
        <Button kind="primary" size="m" disabled={pending || liveBlocker !== null} onClick={() => set('live')}>
          {t('goLive')}
        </Button>
      ) : null}
      {mode !== 'shadow' ? (
        <Button kind="secondary" size="m" disabled={pending} onClick={() => set('shadow')}>
          {t('toShadow')}
        </Button>
      ) : null}
      {mode !== 'paused' ? (
        <Button kind="secondary" size="m" disabled={pending} onClick={() => set('paused')}>
          {t('pause')}
        </Button>
      ) : null}
      <Button kind="ghost" size="m" disabled={pending} onClick={remove}>
        {t('delete')}
      </Button>
    </span>
  );
}
