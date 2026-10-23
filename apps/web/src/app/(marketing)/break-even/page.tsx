import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { BREAK_EVEN_DEFAULTS, breakEven, getPlans } from '@adxlens/core/billing';
import { Button, buttonVariants, Card, Field, Input } from '@adxlens/ui';
import { deps } from '@/server/deps';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('marketing');
  return { title: t('breakEven.title') };
}

const num = (min: number, max: number, def: number) => z.coerce.number().min(min).max(max).catch(def).default(def);
const inputSchema = z.object({
  accounts: num(1, 500, BREAK_EVEN_DEFAULTS.accounts),
  hours: num(0, 200, BREAK_EVEN_DEFAULTS.hoursPerAccount),
  rate: num(0, 10_000_000, BREAK_EVEN_DEFAULTS.hourlyRateVnd),
});

/**
 * M06 Trang hoà vốn công khai (PRD 13.3, P1-06; ADR-0001 B7: công khai, không gắn cờ). Form GET — tính ở
 * server bằng BigInt, giá gói đọc từ `app.billing_plans`.
 */
export default async function BreakEvenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getTranslations('marketing');
  const format = await getFormatter();
  const q = inputSchema.parse(await searchParams);
  const plans = await getPlans(deps().db);
  const r = breakEven(plans, { accounts: q.accounts, hoursPerAccount: q.hours, hourlyRateVnd: q.rate });
  const vnd = (n: bigint) => format.number(Number(n), { style: 'currency', currency: 'VND' });
  const positive = r.netVnd >= 0n;
  return (
    <div className="mx-auto max-w-[880px] px-6 py-14">
      <h1 className="text-h1 font-semibold text-fg">{t('breakEven.title')}</h1>
      <p className="mt-4 text-body text-fg-secondary">{t('breakEven.intro')}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="px-4 py-4">
          <form method="get" className="flex flex-col gap-3">
            <Field label={t('breakEven.accounts')} htmlFor="accounts">
              <Input id="accounts" name="accounts" type="number" min={1} max={500} defaultValue={q.accounts} />
            </Field>
            <Field label={t('breakEven.hours')} htmlFor="hours" hint={t('breakEven.hoursHint')}>
              <Input id="hours" name="hours" type="number" min={0} max={200} step={0.5} defaultValue={q.hours} />
            </Field>
            <Field label={t('breakEven.rate')} htmlFor="rate">
              <Input id="rate" name="rate" type="number" min={0} step={10000} defaultValue={q.rate} />
            </Field>
            <div>
              <Button kind="primary" size="m" type="submit">
                {t('breakEven.calculate')}
              </Button>
            </div>
          </form>
        </Card>
        <Card className="px-4 py-4" data-testid="break-even-result">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-body">
            <dt className="text-fg-secondary">{t('breakEven.plan')}</dt>
            <dd className="font-semibold text-fg">
              {t(`pricing.plans.${r.plan}.name`)}
              {r.extraAccounts ? ` + ${t('breakEven.extra', { count: r.extraAccounts })}` : ''}
            </dd>
            <dt className="text-fg-secondary">{t('breakEven.fee')}</dt>
            <dd className="num text-fg">{vnd(r.feeVnd)}</dd>
            <dt className="text-fg-secondary">{t('breakEven.saved', { hours: r.savedHours })}</dt>
            <dd className="num text-fg">{vnd(r.valueVnd)}</dd>
            <dt className="font-semibold text-fg">{t('breakEven.net')}</dt>
            <dd
              className={`num font-semibold ${positive ? 'text-success' : 'text-danger'}`}
              data-testid="break-even-net"
            >
              {vnd(r.netVnd)}
            </dd>
          </dl>
          <p className="mt-4 text-small text-fg-secondary">
            {t('breakEven.threshold', { rate: vnd(r.breakEvenRateVnd) })}
          </p>
        </Card>
      </div>
      <p className="mt-6 text-small text-fg-secondary">{t('breakEven.formula')}</p>
      <div className="mt-6 flex gap-2">
        <Link href="/pricing" className={buttonVariants({ kind: 'secondary', size: 'm' })}>
          {t('breakEven.toPricing')}
        </Link>
        <Link href="/signup" className={buttonVariants({ kind: 'primary', size: 'm' })}>
          {t('cta.tryFree')}
        </Link>
      </div>
    </div>
  );
}
