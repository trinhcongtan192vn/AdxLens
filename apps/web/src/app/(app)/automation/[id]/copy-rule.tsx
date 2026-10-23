'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Checkbox, Dialog } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

/** ADR-0014: sao chép rule sang tài khoản QC khác (mỗi bản sao chạy thử 14 ngày). */
export function CopyRule({
  id,
  name,
  accounts,
}: {
  id: string;
  name: string;
  accounts: { id: string; name: string }[];
}) {
  const t = useTranslations('automation.copy');
  const tc = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  if (!accounts.length) return null;
  const submit = () =>
    start(async () => {
      try {
        const r = await api<{ created: unknown[]; skipped: unknown[] }>(`automation-rules/${id}/copy`, {
          method: 'POST',
          body: { ad_account_ids: [...picked] },
        });
        toast.success(t('done', { created: r.created.length, skipped: r.skipped.length }));
        setOpen(false);
        setPicked(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });
  return (
    <>
      <Button kind="secondary" size="m" onClick={() => setOpen(true)} data-testid="copy-rule">
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
            <Button kind="primary" size="m" disabled={pending || !picked.size} onClick={submit}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <Banner tone="info" className="mb-3">
          {t('note')}
        </Banner>
        <p className="mb-1 text-small font-medium text-fg-secondary">{t('accounts')}</p>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-body">
              <Checkbox
                checked={picked.has(a.id)}
                onChange={(e) =>
                  setPicked((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(a.id);
                    else next.delete(a.id);
                    return next;
                  })
                }
              />
              {a.name}
            </label>
          ))}
        </div>
      </Dialog>
    </>
  );
}
