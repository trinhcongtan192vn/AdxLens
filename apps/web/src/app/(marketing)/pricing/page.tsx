import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import {
  ANNUAL_DISCOUNT,
  EXTRA_ACCOUNT_MONTHLY_VND,
  PLAN_KEYS,
  PLANS,
  type PlanKey,
} from '@adxlens/core/billing';
import { buttonVariants, cn } from '@adxlens/ui';

export async function generateMetadata() {
  const t = await getTranslations('marketing');
  return { title: t('pricing.title') };
}

/** M02 Bảng giá: 4 gói đọc từ cấu hình `@adxlens/core/billing` (giá không hard-code). */
export default async function Pricing() {
  const t = await getTranslations('marketing');
  const format = await getFormatter();
  const vnd = (n: number) => format.number(n, { style: 'currency', currency: 'VND' });
  const highlighted: PlanKey = 'growth';
  const cta: Record<PlanKey, { label: string; href: string }> = {
    free: { label: t('cta.tryFree'), href: '/signup' },
    starter: { label: t('pricing.choose'), href: '/signup?plan=starter' },
    growth: { label: t('pricing.choose'), href: '/signup?plan=growth' },
    scale: { label: t('pricing.contact'), href: 'mailto:sales@adxlens.com' },
  };
  return (
    <div className="mx-auto max-w-[1112px] px-6 py-14">
      <h1 className="text-center text-h1 font-semibold text-fg">{t('pricing.title')}</h1>
      <p className="mx-auto mt-6 max-w-[720px] text-body text-fg-secondary">
        {t('pricing.basis', {
          extra: vnd(EXTRA_ACCOUNT_MONTHLY_VND),
          discount: Math.round(ANNUAL_DISCOUNT * 100),
        })}
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {PLAN_KEYS.map((key) => {
          const p = PLANS[key];
          return (
            <div
              key={key}
              className={cn(
                'flex flex-col rounded-lg border bg-surface px-5 py-5',
                key === highlighted ? 'border-brand' : 'border-line',
              )}
            >
              <h2 className="text-h2 font-semibold text-fg">{t(`pricing.plans.${key}.name`)}</h2>
              <p className="num mt-2 text-body font-semibold text-fg">
                {p.monthlyPriceVnd === 0
                  ? vnd(0)
                  : t('pricing.perMonth', { price: vnd(p.monthlyPriceVnd) })}
              </p>
              <p className="mt-2 text-body text-fg-secondary">
                {t('pricing.accounts', { count: p.includedAccounts })}
              </p>
              <p className="mt-2 flex-1 text-small text-fg-secondary">
                {t(`pricing.plans.${key}.summary`)}
              </p>
              <Link
                href={cta[key].href}
                className={cn(
                  buttonVariants({
                    kind: key === highlighted ? 'primary' : 'secondary',
                    size: 'm',
                  }),
                  'mt-4',
                )}
              >
                {cta[key].label}
              </Link>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-body">
        <Link href="/break-even" className="text-link hover:underline">
          {t('pricing.breakEvenLink')}
        </Link>
      </p>
    </div>
  );
}
