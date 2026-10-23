import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { billingStatus, getBillingProfile, getPlans, PAID_PLANS } from '@adxlens/core/billing';
import { Banner, buttonVariants, Card, CardHeader } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { ChoosePlan, InvoiceProfileForm, ManageSubscription } from './billing-actions';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('billing') };
}

/** ST03 Gói & thanh toán: gói hiện tại, tài khoản đang hoạt động / hạn mức, ân hạn, đổi gói (Stripe), hủy gói, thông tin hóa đơn. */
export default async function BillingPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'billing.manage');
  const t = await getTranslations('billing');
  const tp = await getTranslations('marketing');
  const format = await getFormatter();
  const s = await billingStatus(pc.ctx);
  const plans = await getPlans(pc.ctx.db);
  const profile = await getBillingProfile(pc.ctx);
  const vnd = (n: number) => format.number(n, { style: 'currency', currency: 'VND' });
  const date = (d: Date) => format.dateTime(d, { dateStyle: 'medium' });
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {s.status === 'past_due' ? (
        <Banner tone="danger">{t('pastDue', { date: s.graceUntil ? date(s.graceUntil) : '' })}</Banner>
      ) : null}
      {s.overLimit ? (
        <Banner tone={s.graceExpired ? 'danger' : 'warning'}>
          {s.graceExpired
            ? t('overLimitExpired', { limit: s.plan.includedAccounts })
            : t('overLimit', {
                active: s.activeAccounts,
                limit: s.plan.includedAccounts,
                date: s.graceUntil ? date(s.graceUntil) : '',
              })}
        </Banner>
      ) : null}
      <Card>
        <CardHeader
          title={t('currentPlan')}
          actions={
            <Link href="/pricing" className={buttonVariants({ kind: 'secondary', size: 's' })}>
              {t('comparePlans')}
            </Link>
          }
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-body">
          <dt className="text-fg-secondary">{t('plan')}</dt>
          <dd className="font-semibold text-fg" data-testid="billing-plan">
            {tp(`pricing.plans.${s.effectivePlan}.name`)}
          </dd>
          <dt className="text-fg-secondary">{t('price')}</dt>
          <dd className="num text-fg">
            {s.plan.monthlyPriceVnd === 0 ? vnd(0) : tp('pricing.perMonth', { price: vnd(s.plan.monthlyPriceVnd) })}
          </dd>
          <dt className="text-fg-secondary">{t('activeAccounts')}</dt>
          <dd className="num text-fg" data-testid="billing-usage">
            {t('usage', { active: s.activeAccounts, limit: s.plan.includedAccounts })}
          </dd>
          {s.currentPeriodEnd ? (
            <>
              <dt className="text-fg-secondary">{s.cancelAtPeriodEnd ? t('endsOn') : t('renewsOn')}</dt>
              <dd className="text-fg">{date(s.currentPeriodEnd)}</dd>
            </>
          ) : null}
        </dl>
        <p className="border-t border-line px-4 py-3 text-small text-fg-secondary">{t('activeHint')}</p>
        {s.provider === 'stripe' && s.status !== 'canceled' ? (
          <div className="border-t border-line px-4 py-3">
            <ManageSubscription cancelAtPeriodEnd={s.cancelAtPeriodEnd} />
          </div>
        ) : null}
      </Card>
      <ChoosePlan
        current={s.effectivePlan}
        plans={PAID_PLANS.map((k) => ({
          key: k,
          label: tp(`pricing.plans.${k}.name`),
          price: tp('pricing.perMonth', { price: vnd(plans[k].monthlyPriceVnd) }),
        }))}
      />
      <InvoiceProfileForm
        initial={{
          companyName: profile?.companyName ?? '',
          taxCode: profile?.taxCode ?? '',
          address: profile?.address ?? '',
          invoiceEmail: profile?.invoiceEmail ?? pc.user.email,
        }}
      />
    </div>
  );
}
