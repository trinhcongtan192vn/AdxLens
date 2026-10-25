'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** Nút trên banner dữ liệu mẫu: kết nối tài khoản thật / xóa dữ liệu mẫu. */
export function DemoActions() {
  const t = useTranslations('demo');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-2">
      <Link href="/connections/new" className={buttonVariants({ kind: 'secondary', size: 's' })}>
        {t('connectReal')}
      </Link>
      <Button
        kind="ghost"
        size="s"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await api('demo', { method: 'DELETE' });
              router.refresh();
            } catch {
              toast.error(tc('errorGeneric'));
            }
          })
        }
      >
        {t('remove')}
      </Button>
    </span>
  );
}
