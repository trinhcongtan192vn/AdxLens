'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** A08: "Bắt đầu" (vào Việc tuần này) hoặc "Xem Creative" — cả hai đều đóng màn chào mừng. */
export function WelcomeActions() {
  const t = useTranslations('welcome');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (href: string) =>
    start(async () => {
      try {
        await api('me/onboarding', { method: 'DELETE' });
        router.push(href);
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button kind="primary" size="m" disabled={pending} onClick={() => go('/weekly-actions')}>
        {t('start')}
      </Button>
      <Button kind="secondary" size="m" disabled={pending} onClick={() => go('/creatives')}>
        {t('creatives')}
      </Button>
    </div>
  );
}
