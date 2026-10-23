'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Card, Dialog, Field, Input } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** ST01 "Xóa workspace": hộp thoại bắt nhập đúng tên workspace. */
export function DeleteWorkspace({ name }: { name: string }) {
  const t = useTranslations('settingsWorkspace');
  const tc = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [pending, start] = useTransition();
  return (
    <Card className="px-4 py-4">
      <h2 className="text-h3 font-semibold text-fg">{t('deleteTitle')}</h2>
      <p className="mt-1 text-small text-fg-secondary">{t('deleteBody')}</p>
      <Button kind="secondary" size="m" className="mt-3 border-danger-line text-danger" onClick={() => setOpen(true)}>
        {t('deleteButton')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('deleteTitle')}
        description={t('deleteConfirmHint', { name })}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="danger"
              size="m"
              disabled={confirm !== name || pending}
              onClick={() =>
                start(async () => {
                  try {
                    await api('workspace', { method: 'DELETE', body: { confirmName: confirm } });
                    router.push('/overview');
                    router.refresh();
                  } catch {
                    toast.error(tc('errorGeneric'));
                  }
                })
              }
            >
              {t('deleteForever')}
            </Button>
          </>
        }
      >
        <Field label={t('deleteConfirmLabel')} htmlFor="confirmName">
          <Input id="confirmName" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
      </Dialog>
    </Card>
  );
}
