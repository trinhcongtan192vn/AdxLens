'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Banner, Button, Card, CardHeader, Dialog, Field, Textarea } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Controls = {
  workspace: { active: boolean; reason: string | null };
  global: boolean;
  breakers: { adAccountId: string; accountName: string; open: boolean; failures: number }[];
};

/** P205: kill switch của workspace (bật cần lý do, hủy ngay hành động đang chờ) + mở khóa circuit breaker. */
export function KillSwitchCard({ controls }: { controls: Controls }) {
  const t = useTranslations('killSwitch');
  const tc = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const set = (active: boolean) =>
    start(async () => {
      try {
        const r = await api<{ canceled: number }>('kill-switch', { method: 'POST', body: { active, reason } });
        setOpen(false);
        setReason('');
        toast.success(active ? t('onToast', { count: r.canceled }) : t('offToast'));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  const close = (id: string) =>
    start(async () => {
      try {
        await api(`circuit-breakers/${id}/close`, { method: 'POST' });
        toast.success(t('breakerClosed'));
        router.refresh();
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });
  const on = controls.workspace.active;
  return (
    <Card>
      <CardHeader
        title={t('title')}
        actions={
          <Badge tone={on ? 'danger' : 'success'} data-testid="kill-switch-state">
            {on ? t('on') : t('off')}
          </Badge>
        }
      />
      <div className="flex flex-col gap-3 px-4 py-4 text-body">
        {controls.global ? <Banner tone="danger">{t('globalOn')}</Banner> : null}
        <p className="text-fg-secondary">{t('body')}</p>
        {on && controls.workspace.reason ? (
          <p className="text-fg">{t('reason', { reason: controls.workspace.reason })}</p>
        ) : null}
        <div>
          {on ? (
            <Button kind="secondary" size="m" disabled={pending} onClick={() => set(false)}>
              {t('turnOff')}
            </Button>
          ) : (
            <Button kind="danger" size="m" onClick={() => setOpen(true)}>
              {t('turnOn')}
            </Button>
          )}
        </div>
        {controls.breakers.length ? (
          <div className="border-t border-line pt-3">
            <h3 className="mb-2 text-body font-semibold text-fg">{t('breakers')}</h3>
            <ul className="flex flex-col gap-2">
              {controls.breakers.map((b) => (
                <li key={b.adAccountId} className="flex items-center justify-between gap-2">
                  <span>
                    {b.accountName} ·{' '}
                    {b.open ? (
                      <Badge tone="danger">{t('locked')}</Badge>
                    ) : (
                      <span className="text-fg-secondary">{t('failures', { count: b.failures })}</span>
                    )}
                  </span>
                  {b.open ? (
                    <Button kind="secondary" size="s" disabled={pending} onClick={() => close(b.adAccountId)}>
                      {t('unlock')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('confirmTitle')}
        description={t('confirmBody')}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button kind="danger" size="m" disabled={pending || reason.trim().length < 5} onClick={() => set(true)}>
              {t('turnOn')}
            </Button>
          </>
        }
      >
        <Field label={t('reasonLabel')} htmlFor="ks-reason">
          <Textarea id="ks-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </Card>
  );
}
