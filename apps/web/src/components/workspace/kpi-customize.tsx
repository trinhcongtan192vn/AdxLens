'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button, cn, Dialog } from '@adxlens/ui';
import { api } from '@/lib/api-client';

/** "Customize" 4 KPI trang chủ (như Madgicx): chọn đúng 4 chỉ số, lưu cookie theo người xem. */
export function KpiCustomize({ current, options }: { current: string[]; options: readonly string[] }) {
  const t = useTranslations('wsHome');
  const tm = useTranslations('metrics');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(current);
  const [pending, start] = useTransition();
  const toggle = (k: string) =>
    setSel((x) => (x.includes(k) ? x.filter((y) => y !== k) : x.length < 4 ? [...x, k] : x));
  return (
    <>
      <Button kind="ghost" size="s" onClick={() => setOpen(true)}>
        {t('customize')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('customizeTitle')}
        closeLabel={t('close')}
        footer={
          <Button
            kind="primary"
            size="m"
            disabled={pending || sel.length !== 4}
            onClick={() =>
              start(async () => {
                await api('me/preferences', { method: 'POST', body: { wKpis: sel } });
                setOpen(false);
                router.refresh();
              })
            }
          >
            {t('save')}
          </Button>
        }
      >
        <p className="mb-3 text-small text-fg-secondary">{t('customizeHint', { n: sel.length })}</p>
        <div className="grid grid-cols-2 gap-2">
          {options.map((k) => {
            const on = sel.includes(k);
            return (
              <button
                key={k}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!on && sel.length >= 4}
                onClick={() => toggle(k)}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-left text-small disabled:opacity-50',
                  on ? 'border-brand bg-brand-subtle text-fg' : 'border-line text-fg-secondary hover:bg-hover',
                )}
              >
                {tm(`${k}.name`)}
              </button>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
