'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Field, Textarea } from '@adxlens/ui';
import { api } from '@/lib/api-client';

export function GlobalKillSwitchForm({ active }: { active: boolean }) {
  const t = useTranslations('admin.killSwitch');
  const tc = useTranslations('common');
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      try {
        const r = await api<{ canceled: number }>('admin/kill-switch', {
          method: 'POST',
          body: { active: !active, reason },
        });
        setReason('');
        toast.success(t('done', { count: r.canceled }));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('reason')} htmlFor="global-reason">
        <Textarea id="global-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div>
        <Button
          kind={active ? 'secondary' : 'danger'}
          size="m"
          disabled={pending || reason.trim().length < 5}
          onClick={submit}
        >
          {active ? t('turnOff') : t('turnOn')}
        </Button>
      </div>
    </div>
  );
}
