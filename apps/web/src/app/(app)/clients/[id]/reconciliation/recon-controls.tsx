'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** Chọn tài khoản, khoảng ngày và "Chạy lại đồng bộ" (D04). */
export function ReconControls({
  accounts,
  accountId,
  range,
  canResync,
  resyncRange,
}: {
  accounts: { id: string; name: string }[];
  accountId: string;
  range: string;
  canResync: boolean;
  resyncRange: { from: string; to: string };
}) {
  const t = useTranslations('recon');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const go = (next: { account?: string; range?: string }) =>
    router.push(`${pathname}?${new URLSearchParams({ account: accountId, range, ...next })}`);

  return (
    <>
      <Select
        aria-label={t('account')}
        value={accountId}
        onChange={(e) => go({ account: e.target.value })}
        className="w-56"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select aria-label={t('range')} value={range} onChange={(e) => go({ range: e.target.value })} className="w-40">
        {(['7', '14', '30'] as const).map((r) => (
          <option key={r} value={r}>
            {t(`ranges.${r}`)}
          </option>
        ))}
      </Select>
      <div className="flex-1" />
      {canResync ? (
        <Button
          kind="secondary"
          size="m"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await api(`ad-accounts/${accountId}/resync`, { method: 'POST', body: resyncRange });
                toast.success(t('resyncQueued'));
              } catch {
                toast.error(tc('errorGeneric'));
              }
            })
          }
        >
          {t('resync')}
        </Button>
      ) : null}
    </>
  );
}
