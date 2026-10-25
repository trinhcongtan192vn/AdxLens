import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { listAdAccounts } from '@adxlens/core/connections';
import { listRuleTemplates } from '@adxlens/core/execution';
import { PageHeader } from '@adxlens/ui';
import { requirePermission } from '@/server/guards';
import { getPageContext, requireFlag } from '@/server/page-context';
import { RuleBuilder } from './rule-builder';

export async function generateMetadata() {
  const t = await getTranslations('automation');
  return { title: t('new') };
}

/** P212 Rule builder từ mẫu (P2-10) + P213 backtest 30 ngày trước khi lưu (P2-11). */
export default async function NewRulePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; account?: string }>;
}) {
  const sp = await searchParams;
  const pc = await getPageContext();
  await requireFlag(pc, 'p2b_auto');
  requirePermission(pc, 'automation.manage');
  const t = await getTranslations('automation');
  const [accounts, templates] = await Promise.all([listAdAccounts(pc.ctx), listRuleTemplates(pc.ctx)]);
  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="a" href="/automation" className="hover:text-fg">
            {t('title')}
          </Link>,
          t('new'),
        ]}
        title={t('new')}
      />
      <RuleBuilder
        initialTemplate={sp.template ?? null}
        initialAccountId={sp.account ?? null}
        accounts={accounts.filter((a) => a.connectionStatus !== 'revoked').map((a) => ({ id: a.id, name: a.name }))}
        templates={templates.map((x) => ({
          key: x.key,
          level: x.level,
          condition: x.condition,
          action: x.action,
          doneCount: x.doneCount,
          requiresMaxDailyBudget: x.requiresMaxDailyBudget,
          requiresFloorDailyBudget: x.requiresFloorDailyBudget,
          tactic: x.tactic,
        }))}
      />
    </>
  );
}
