import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { billingStatus } from '@adxlens/core/billing';
import { Banner, buttonVariants, Card } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('billing') };
}

/**
 * ST04 Kết quả checkout: Stripe chuyển về đây. Gói chỉ đổi khi webhook đã xác minh tới — trang không
 * tự đổi gói theo query.
 */
export default async function CheckoutResultPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const pc = await getPageContext();
  requirePermission(pc, 'billing.manage');
  const t = await getTranslations('billing');
  const tp = await getTranslations('marketing');
  const ok = (await searchParams).status === 'success';
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
