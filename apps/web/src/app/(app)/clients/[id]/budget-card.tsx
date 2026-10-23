'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Dialog, Field, Input } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type Pacing = {
  month: string;
  amount: string;
  currency: string;
  spent: string;
  daysElapsed: number;
  daysInMonth: number;
  projected: string | null;
  projectedPct: number | null;
  dailyNeeded: string | null;
  status: 'on_track' | 'over' | 'under';
};

const TONE = { on_track: 'success', over: 'danger', under: 'warning' } as const;

/** A3: ngân sách tháng của Client — tiến độ chi, dự kiến cả tháng, mức chi mỗi ngày còn lại; Owner / Manager đặt. */
export function BudgetCard({
  clientId,
  pacing,
  month,
  currency,
  canManage,
}: {
  clientId: string;
  pacing: Pacing | null;
  month: string;
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations('clients.budget');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(pacing ? String(Number(pacing.amount)) : '');
  const [pending, start] = useTransition();
  const money = (v: string | null) =>
    v === null ? '—' : `${format.number(Number(v), { maximumFractionDigits: currency === 'VND' ? 0 : 2 })} ${currency}`;
  const label = `${month.slice(5)}/${month.slice(0, 4)}`;
  if (!pacing && !canManage) return null;

  const save = () =>
    start(async () => {
      try {
        await api(`clients/${clientId}/budget`, { method: 'PUT', body: { month, amount: amount.trim(), currency } });
        toast.success(t('saved'));
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : tc('errorGeneric'));
      }
    });

  const spentPct = pacing ? Math.min(100, (Number(pacing.spent) / Number(pacing.amount)) * 100) : 0;
  const timePct = pacing ? (pacing.daysElapsed / pacing.daysInMonth) * 100 : 0;

  return (
    <Card className="mb-4 px-4 py-3" data-testid="budget-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body font-semibold">{t('title', { month: label })}</span>
        {pacing ? <Badge tone={TONE[pacing.status]}>{t(`status.${pacing.status}`)}</Badge> : null}
        <div className="flex-1" />
        {canManage ? (
          <Button kind={pacing ? 'ghost' : 'secondary'} size="s" onClick={() => setOpen(true)}>
            {pacing ? t('edit') : t('set')}
          </Button>
        ) : null}
      </div>
      {pacing ? (
        <>
          <div className="relative mt-2 h-2 rounded-full bg-subtle" aria-hidden>
            <div
              className={`h-2 rounded-full ${pacing.status === 'over' ? 'bg-danger' : pacing.status === 'under' ? 'bg-warning' : 'bg-success'}`}
              style={{ width: `${spentPct}%` }}
            />
            <div className="absolute top-[-3px] h-3.5 w-0.5 bg-fg-secondary" style={{ left: `${timePct}%` }} />
          </div>
          <p className="mt-2 text-body text-fg-secondary">
            {t('spent', {
              spent: money(pacing.spent),
              amount: money(pacing.amount),
              days: pacing.daysElapsed,
              total: pacing.daysInMonth,
            })}
            {pacing.projected ? (
              <>
                {' · '}
                {t('projected', {
                  projected: money(pacing.projected),
                  pct: `${(pacing.projectedPct ?? 0) > 0 ? '+' : ''}${format.number(pacing.projectedPct ?? 0, { maximumFractionDigits: 1 })}%`,
                })}
              </>
            ) : null}
            {pacing.dailyNeeded ? (
              <>
                {' · '}
                {t('dailyNeeded', { amount: money(pacing.dailyNeeded) })}
              </>
            ) : null}
          </p>
        </>
      ) : (
        <p className="mt-1 text-small text-fg-tertiary">{t('empty')}</p>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('dialogTitle', { month: label })}
        closeLabel={tc('close')}
        footer={
          <>
            <Button kind="secondary" size="m" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              kind="primary"
              size="m"
              disabled={pending || !/^\d+(\.\d{1,2})?$/.test(amount.trim())}
              onClick={save}
            >
              {tc('save')}
            </Button>
          </>
        }
      >
        <Field label={t('amount', { currency })} htmlFor="budget-amount">
          <Input id="budget-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <p className="mt-2 text-small text-fg-tertiary">{t('hint')}</p>
      </Dialog>
    </Card>
  );
}
