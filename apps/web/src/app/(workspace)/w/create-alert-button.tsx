'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** Tạo cảnh báo 1 click từ gợi ý. */
export function CreateAlertButton({ body }: { body: Record<string, unknown> }) {
  const t = useTranslations('wsHome.suggest');
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Button
      kind={done ? 'ghost' : 'secondary'}
      size="s"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          try {
            await api('alerts', { method: 'POST', body });
            setDone(true);
            toast.success(t('created'));
            router.refresh();
          } catch {
            toast.error(t('error'));
          }
        })
      }
    >
      {done ? t('createdShort') : t('create')}
    </Button>
  );
}
