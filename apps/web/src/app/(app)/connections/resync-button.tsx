'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, Segmented } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

const RANGES = [7, 30, 90] as const;

/** Ngày `iso` (YYYY-MM-DD) lùi `n` ngày (lịch, không phụ thuộc múi giờ máy). */
export function minusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Chạy lại đồng bộ một tài khoản QC (7 / 30 / 90 ngày tới hôm qua theo múi giờ tài khoản), xong tự đối chiếu lại.
 * Máy chủ chặn khi tài khoản đang đồng bộ.
 */
export function ResyncButton({
  adAccountId,
  name,
  yesterday,
}: {
  adAccountId: string;
  name: string;
  yesterday: string;
}) {
  const t = useTranslations('connect.resync');
  const tc = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      try {
        await api(`ad-accounts/${adAccountId}/resync`, {
          method: 'POST',
          body: { from: minusDays(yesterday, days - 1), to: yesterday },
        });
        toast.success(t('queued'));
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });
  return (
    <>
      <Button
        kind="ghost"
        size="s"
        onClick={() => setOpen(true)}
        aria-label={t('aria', { name })}
        data-testid={`resync-${adAccountId}`}
      >
        <RefreshCw className="size-4" aria-hidden />
        {t('button')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('title', { name })}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button kind="primary" size="m" disabled={pending} onClick={submit} data-testid="resync-confirm">
              {t('confirm')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-body text-fg-secondary">{t('body')}</p>
        <Segmented
          value={String(days)}
          onChange={(v: string) => setDays(Number(v) as (typeof RANGES)[number])}
          options={RANGES.map((d) => ({ value: String(d), label: t('days', { n: d }) }))}
        />
      </Dialog>
    </>
  );
}
