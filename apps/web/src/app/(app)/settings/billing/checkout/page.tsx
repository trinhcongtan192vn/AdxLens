import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { billingStatus, confirmPayosOrder } from '@adxlens/core/billing';
import { Banner, buttonVariants, Card } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { payos } from '@/server/payos';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('billing') };
}

/**
 * ST04 Kết quả checkout. Stripe: gói chỉ đổi khi webhook đã xác minh tới — trang không tự đổi gói theo
 * query. PayOS: tra trạng thái đơn trên PayOS bằng khóa của AdxLens (không tin query PayOS gắn vào URL).
 */
export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; provider?: string; orderCode?: string }>;
}) {
  const pc = await getPageContext();
  requirePermission(pc, 'billing.manage');
  const t = await getTranslations('billing');
  const tp = await getTranslations('marketing');
  const q = await searchParams;
  const format = await getFormatter();
  if (q.provider === 'payos' && q.orderCode && /^\d{1,15}$/.test(q.orderCode)) {
    const code = Number(q.orderCode);
    const state = await confirmPayosOrder(pc.ctx, code, { payos: payos() }).catch(() => 'pending' as const);
    const s = await billingStatus(pc.ctx);
    return (
      <Card className="flex max-w-[720px] flex-col gap-3 px-4 py-4">
        {state === 'paid' ? (
          <Banner tone="success">
            {t('payosPaid', {
              plan: tp(`pricing.plans.${s.effectivePlan}.name`),
              date: s.currentPeriodEnd ? format.dateTime(s.currentPeriodEnd, { dateStyle: 'medium' }) : '',
            })}
          </Banner>
        ) : state === 'pending' ? (
          <Banner tone="info">{t('payosPending')}</Banner>
        ) : (
          <Banner tone="info">{t('checkoutCanceled')}</Banner>
        )}
        <div>
          <Link href="/settings/billing" className={buttonVariants({ kind: 'primary', size: 'm' })}>
            {t('backToBilling')}
          </Link>
        </div>
      </Card>
    );
  }
  const ok = q.status === 'success';
  const s = await billingStatus(pc.ctx);
  return (
    <Card className="flex max-w-[720px] flex-col gap-3 px-4 py-4">
      {ok ? (
        <Banner tone="success">
          {s.provider === 'stripe' && s.status === 'active'
            ? t('checkoutSuccess', { plan: tp(`pricing.plans.${s.effectivePlan}.name`) })
            : t('checkoutProcessing')}
        </Banner>
      ) : (
        <Banner tone="info">{t('checkoutCanceled')}</Banner>
      )}
      <div>
        <Link href="/settings/billing" className={buttonVariants({ kind: 'primary', size: 'm' })}>
          {t('backToBilling')}
        </Link>
      </div>
    </Card>
  );
}
