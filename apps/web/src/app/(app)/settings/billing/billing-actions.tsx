'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Card, CardHeader, Field, Input, Select } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type PaidPlan = 'starter' | 'growth' | 'scale';

function errorToast(e: unknown, t: (k: string) => string, tc: (k: string) => string) {
  if (e instanceof ApiError && e.code === 'SERVICE_UNAVAILABLE') toast.error(t('unavailable'));
  else toast.error(tc('errorGeneric'));
}

/** Chọn gói trả phí → Stripe Checkout (thẻ quốc tế, 027) hoặc PayOS (QR / chuyển khoản VND, 028). */
export function ChoosePlan({
  plans,
  current,
  canRenew,
  lockedMethod,
}: {
  plans: { key: PaidPlan; label: string; price: string }[];
  current: string;
  /** PayOS trả theo kỳ: gói hiện tại có nút "Gia hạn". */
  canRenew: boolean;
  /** Đang có gói ở một cổng thì chỉ dùng cổng đó. */
  lockedMethod: 'stripe' | 'payos' | null;
}) {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [method, setMethod] = useState<'stripe' | 'payos'>(lockedMethod ?? 'payos');
  const [pending, start] = useTransition();
  const checkout = (plan: PaidPlan) =>
    start(async () => {
      try {
        const r = await api<{ url: string }>('billing/checkout', { method: 'POST', body: { plan, period, method } });
        window.location.assign(r.url);
      } catch (e) {
        errorToast(e, t, tc);
      }
    });
  return (
    <Card>
      <CardHeader
        title={t('changePlan')}
        actions={
          <div className="flex gap-2">
            <Select
              aria-label={t('method')}
              value={method}
              disabled={lockedMethod !== null}
              onChange={(e) => setMethod(e.target.value as 'stripe' | 'payos')}
              className="w-auto"
            >
              <option value="payos">{t('methodPayos')}</option>
              <option value="stripe">{t('methodStripe')}</option>
            </Select>
            <Select
              aria-label={t('period')}
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'monthly' | 'annual')}
              className="w-auto"
            >
              <option value="monthly">{t('monthly')}</option>
              <option value="annual">{t('annual')}</option>
            </Select>
          </div>
        }
      />
      <ul className="divide-y divide-line">
        {plans.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-3 text-body">
            <span>
              <span className="font-semibold text-fg">{p.label}</span>
              <span className="num ml-2 text-fg-secondary">{p.price}</span>
            </span>
            {p.key === current && !(canRenew && method === 'payos') ? (
              <span className="text-small text-fg-secondary">{t('currentBadge')}</span>
            ) : (
              <Button kind="secondary" size="s" disabled={pending} onClick={() => checkout(p.key)}>
                {p.key === current ? t('renew') : t('choose')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Quản lý thanh toán (cổng Stripe) + hủy / tiếp tục gói cuối kỳ. */
export function ManageSubscription({
  cancelAtPeriodEnd,
  portal: hasPortal,
}: {
  cancelAtPeriodEnd: boolean;
  portal: boolean;
}) {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const portal = () =>
    start(async () => {
      try {
        const r = await api<{ url: string }>('billing/portal', { method: 'POST' });
        window.location.assign(r.url);
      } catch (e) {
        errorToast(e, t, tc);
      }
    });
  const cancel = (value: boolean) =>
    start(async () => {
      if (value && !window.confirm(t('cancelConfirm'))) return;
      try {
        await api('billing/cancel', { method: 'POST', body: { cancel: value } });
        toast.success(value ? t('canceled') : t('resumed'));
        router.refresh();
      } catch (e) {
        errorToast(e, t, tc);
      }
    });
  return (
    <div className="flex flex-wrap gap-2">
      {hasPortal ? (
        <Button kind="secondary" size="m" disabled={pending} onClick={portal}>
          {t('managePayment')}
        </Button>
      ) : null}
      {cancelAtPeriodEnd ? (
        <Button kind="secondary" size="m" disabled={pending} onClick={() => cancel(false)}>
          {t('resume')}
        </Button>
      ) : (
        <Button kind="ghost" size="m" disabled={pending} onClick={() => cancel(true)}>
          {t('cancel')}
        </Button>
      )}
    </div>
  );
}

type Profile = { companyName: string; taxCode: string; address: string; invoiceEmail: string };

/** Thông tin xuất hóa đơn. */
export function InvoiceProfileForm({ initial }: { initial: Profile }) {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [invalid, setInvalid] = useState<string[]>([]);
  const save = (fd: FormData) =>
    start(async () => {
      setInvalid([]);
      try {
        await api('billing/profile', {
          method: 'PUT',
          body: {
            companyName: String(fd.get('companyName') ?? ''),
            taxCode: String(fd.get('taxCode') ?? ''),
            address: String(fd.get('address') ?? ''),
            invoiceEmail: String(fd.get('invoiceEmail') ?? ''),
          },
        });
        toast.success(tc('saved'));
        router.refresh();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
          const issues = (e.details.issues as { path: string }[] | undefined) ?? [];
          setInvalid(issues.map((i) => i.path));
        } else toast.error(tc('errorGeneric'));
      }
    });
  const err = (k: string) => (invalid.includes(k) ? t('invalid') : undefined);
  return (
    <Card>
      <CardHeader title={t('invoiceInfo')} />
      <form action={save} className="flex flex-col gap-3 px-4 py-4">
        <Field label={t('companyName')} htmlFor="companyName" error={err('companyName')}>
          <Input id="companyName" name="companyName" defaultValue={initial.companyName} maxLength={200} required />
        </Field>
        <Field label={t('taxCode')} htmlFor="taxCode" error={err('taxCode')}>
          <Input id="taxCode" name="taxCode" defaultValue={initial.taxCode} maxLength={20} inputMode="numeric" />
        </Field>
        <Field label={t('address')} htmlFor="address" error={err('address')}>
          <Input id="address" name="address" defaultValue={initial.address} maxLength={300} />
        </Field>
        <Field label={t('invoiceEmail')} htmlFor="invoiceEmail" error={err('invoiceEmail')}>
          <Input id="invoiceEmail" name="invoiceEmail" type="email" defaultValue={initial.invoiceEmail} required />
        </Field>
        <div>
          <Button kind="primary" size="m" type="submit" disabled={pending}>
            {tc('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
