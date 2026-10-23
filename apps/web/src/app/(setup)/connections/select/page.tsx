import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { billingStatus } from '@adxlens/core/billing';
import { listAvailableAccounts } from '@adxlens/core/connections';
import { SetupShell } from '@/components/setup-shell';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { SelectAccounts } from './select-accounts';

export async function generateMetadata() {
  const t = await getTranslations('connect');
  return { title: t('s04Title') };
}

/** S04 Chọn tài khoản QC (D, E, L). */
export default async function SelectAccountsPage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const pc = await getPageContext();
  requirePermission(pc, 'connections.manage');
  const id = z
    .string()
    .uuid()
    .safeParse((await searchParams).connection);
  if (!id.success) notFound();
  const accounts = await listAvailableAccounts(pc.ctx, id.data).catch(() => null);
  if (!accounts) notFound();
  const t = await getTranslations('connect');
  const billing = await billingStatus(pc.ctx);
  const plan = billing.effectivePlan;
  return (
    <SetupShell stepLabel={t('step', { n: 3, total: 4 })} width="lg">
      <SelectAccounts
        connectionId={id.data}
        planName={t(`plans.${plan}`)}
        limit={billing.plan.includedAccounts}
        accounts={accounts.map((a) => ({
          metaAccountId: a.metaAccountId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          spend30d: a.spend30d,
          spendChecked: a.spendChecked,
          imported: a.imported,
        }))}
      />
    </SetupShell>
  );
}
