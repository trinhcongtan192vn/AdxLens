'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** P201: cấp quyền ghi (OAuth nâng quyền), thu hồi hoặc bật lại cho một kết nối. */
export function WriteAccessActions({
  connectionId,
  enabled,
  hasScope,
  canGrant,
}: {
  connectionId: string;
  enabled: boolean;
  hasScope: boolean;
  canGrant: boolean;
}) {
  const t = useTranslations('writeAccess');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (value: boolean) =>
    start(async () => {
      if (!value && !window.confirm(t('revokeConfirm'))) return;
      try {
        await api(`connections/${connectionId}/write-access`, { method: 'POST', body: { enabled: value } });
        toast.success(value ? t('enabledToast') : t('revokedToast'));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  if (enabled) {
    return (
      <Button kind="secondary" size="s" disabled={pending} onClick={() => set(false)}>
        {t('revoke')}
      </Button>
    );
  }
  if (hasScope) {
    return (
      <Button kind="secondary" size="s" disabled={pending || !canGrant} onClick={() => set(true)}>
        {t('reenable')}
      </Button>
    );
  }
  return canGrant ? (
    <a href="/api/v1/connections/meta/authorize?scope=write" className={buttonVariants({ kind: 'primary', size: 's' })}>
      {t('grant')}
    </a>
  ) : (
    <Button kind="primary" size="s" disabled>
      {t('grant')}
    </Button>
  );
}
