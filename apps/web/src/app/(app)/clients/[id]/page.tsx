import Link from 'next/link';
import { clientPacing, getClientGoal, goalSuggestions } from '@adxlens/core/reporting';
import { localDate } from '@adxlens/core/shared';
import { BudgetCard } from './budget-card';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { listAdAccounts, listAssets } from '@adxlens/core/connections';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import { can, canApproveActions, getClient } from '@adxlens/core/tenancy';
import { entityTable, latestEntityChanges } from '@adxlens/core/reporting';
import {
  Banner,
  buttonVariants,
  Card,
  EmptyState,
  PageHeader,
  SourceFootnote,
  TabBar,
  tabItemClass,
} from '@adxlens/ui';
import { GoalCard } from './goal-card';
import { EntityGrid } from '@/components/entity-grid';
import { toGridRows } from '@/server/grid';
import { ClientReports } from './client-reports';
import { currentRanges } from '@/server/period';
import { ReconBadge } from '@/components/recon-badge';
import { worstRecon } from '@/lib/recon';
import { getPageContext } from '@/server/page-context';
import { ClientAccounts, ClientActions } from './client-detail';

const TABS = ['campaigns', 'adsets', 'ads', 'goals', 'reports', 'settings'] as const;
const LEVEL = { campaigns: 'campaign', adsets: 'adset', ads: 'ad' } as const;
type Tab = (typeof TABS)[number];

async function load(id: string) {
  const pc = await getPageContext();
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await getClient(pc.ctx, id).catch(() => null);
  if (!client || client.archivedAt) notFound();
  return { pc, client };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { client } = await load((await params).id);
  return { title: client.name };
}

/** C02 Client: khung tab (Penpot). Bảng chiến dịch/nhóm/quảng cáo điền từ 012–013. */
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { pc, client } = await load((await params).id);
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'campaigns';
  const t = await getTranslations('clients');
  const canManage = can(pc.ctx.actor.role, 'clients.manage');
  const accounts = await listAdAccounts(pc.ctx, { clientId: client.id });
  const reconMap = await accountReconciliation(
    pc.ctx,
    accounts.map((a) => a.id),
  );
  const recon = worstRecon([...reconMap.values()]);
  const te = await getTranslations('entities');
  // Kỳ theo bộ chọn trên thanh trên, ngày theo múi giờ tài khoản đầu tiên của Client.
  const ranges = await currentRanges(accounts[0]?.timezone ?? 'Asia/Ho_Chi_Minh');
  // A3: ngân sách tháng hiện tại (theo múi giờ tài khoản đầu tiên).
  const pacing = accounts.length ? await clientPacing(pc.ctx, client.id) : null;
  const budgetMonth = localDate(new Date(), accounts[0]?.timezone ?? 'Asia/Ho_Chi_Minh').slice(0, 7);
  const goal = await getClientGoal(pc.ctx, client.id);
  const tg = await getTranslations('goals');

  return (
    <>
      <PageHeader
        breadcrumb={[
          <Link key="c" href="/clients" className="hover:text-fg">
            {t('backToClients')}
          </Link>,
          client.name,
        ]}
        title={
          <span className="flex items-center gap-3">
            {client.name}
            {/* Luôn có lối vào D04 khi Client có tài khoản: chưa đối chiếu vẫn cần nút "Chạy lại đồng bộ". */}
            {accounts.length > 0 ? (
              <Link href={`/clients/${client.id}/reconciliation`} className="text-body font-normal">
                <ReconBadge status={recon.status} pct={recon.maxSpendDeltaPct} />
              </Link>
            ) : null}
          </span>
        }
        actions={canManage ? <ClientActions id={client.id} name={client.name} /> : null}
      />
      {accounts.length && canManage && !goal?.onboardedAt ? (
        <Banner tone="info" className="mb-3">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {tg('banner')}
            <Link href={`/clients/${client.id}/onboarding`} className={buttonVariants({ kind: 'primary', size: 's' })}>
              {tg('bannerCta')}
            </Link>
          </span>
        </Banner>
      ) : null}
      {accounts.length ? (
        <BudgetCard
          clientId={client.id}
          pacing={pacing}
          month={budgetMonth}
          currency={pacing?.currency ?? accounts[0]!.currency}
          canManage={canManage}
        />
      ) : null}
      <TabBar className="mb-4">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/clients/${client.id}?tab=${k}`}
            role="tab"
            aria-selected={tab === k}
            className={tabItemClass(tab === k)}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </TabBar>
      {tab === 'settings' ? (
        <ClientAccounts
          canManage={canManage}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            metaAccountId: a.metaAccountId,
            confirmed: a.assignmentStatus === 'confirmed',
          }))}
        />
      ) : tab === 'campaigns' || tab === 'adsets' || tab === 'ads' ? (
        <>
          <EntityGrid
            level={LEVEL[tab]}
            canAct={pc.flags.p2a_approve && canApproveActions(pc.ctx.actor, client.id)}
            showParent={LEVEL[tab] !== 'campaign'}
            rows={await clientGrid(pc.ctx, accounts, LEVEL[tab], ranges)}
          />
          <SourceFootnote className="mt-2">{te('footnote', ranges.cur)}</SourceFootnote>
        </>
      ) : tab === 'goals' ? (
        <GoalCard
          clientId={client.id}
          goal={goal}
          actual={await goalSuggestions(pc.ctx, client.id)}
          assets={await listAssets(pc.ctx)}
          canManage={canManage}
        />
      ) : tab === 'reports' && pc.flags.p0_reports ? (
        <ClientReports clientId={client.id} canCreate={can(pc.ctx.actor.role, 'reports.manage')} />
      ) : (
        <Card>
          <EmptyState title={t(`tabs.${tab}`)} description={t('c02NoData')} />
        </Card>
      )}
    </>
  );
}

/** G1: dòng bảng kỳ này + kỳ trước + tên cấp cha (chiến dịch của nhóm QC, nhóm QC của quảng cáo). */
async function clientGrid(
  ctx: Parameters<typeof entityTable>[0],
  accounts: { id: string; currency: string }[],
  level: 'campaign' | 'adset' | 'ad',
  ranges: { cur: { from: string; to: string }; prev: { from: string; to: string } },
) {
  const ids = accounts.map((a) => a.id);
  const parentLevel = level === 'ad' ? 'adset' : level === 'adset' ? 'campaign' : null;
  const [cur, prev, parents, changes] = await Promise.all([
    entityTable(ctx, ids, level, ranges.cur),
    entityTable(ctx, ids, level, ranges.prev),
    parentLevel ? entityTable(ctx, ids, parentLevel, ranges.cur) : Promise.resolve([]),
    latestEntityChanges(ctx, ids, level),
  ]);
  const names = new Map(parents.map((p) => [`${p.adAccountId}:${p.metaId}`, p.name]));
  return toGridRows(level, cur, prev, Object.fromEntries(accounts.map((a) => [a.id, a.currency])), names, changes);
}
