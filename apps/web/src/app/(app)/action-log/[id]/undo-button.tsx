'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Dialog } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

/** P2-06: xác nhận rồi tạo hành động hoàn tác (đi qua đúng gateway). */
export function UndoButton({ id }: { id: string }) {
  const t = useTranslations('actionLog');
  const tc = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      try {
        const r = await api<{ action_id: string }>(`actions/${id}/undo`, { method: 'POST' });
        setOpen(false);
        toast.success(t('undoQueued'));
        router.push(`/action-log/${r.action_id}`);
      } catch (e) {
        toast.error(
          e instanceof ApiError && t.has(`errors.${e.code}`) ? t(`errors.${e.code}` as never) : tc('errorGeneric'),
        );
      }
    });
  return (
    <>
      <Button kind="secondary" size="s" onClick={() => setOpen(true)}>
        {t('undo')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('undoTitle')}
        description={t('undoBody')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button kind="primary" size="m" disabled={pending} onClick={confirm}>
              {t('undoConfirm')}
            </Button>
          </>
        }
      />
    </>
  );
}
