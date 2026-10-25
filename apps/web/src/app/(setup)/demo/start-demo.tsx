'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, buttonVariants } from '@adxlens/ui';
import { api } from '@/lib/api-client';

export function StartDemo({ exists }: { exists: boolean }) {
  const t = useTranslations('demo');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mt-5">
      {exists ? (
        <Banner tone="info" className="mb-3">
          {t('already')}
        </Banner>
      ) : null}
      <div className="flex gap-2">
        <Link href="/connections/new" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
          {t('back')}
        </Link>
        {exists ? (
          <Link href="/w" className={buttonVariants({ kind: 'primary', size: 'm' })}>
            {t('goOverview')}
          </Link>
        ) : (
          <Button
            kind="primary"
            size="m"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await api('demo', { method: 'POST' });
                  router.push('/connections/sync');
                } catch {
                  toast.error(tc('errorGeneric'));
                }
              })
            }
          >
            {pending ? t('starting') : t('start')}
          </Button>
        )}
      </div>
    </div>
  );
}
