import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { listAdAccounts } from '@adxlens/core/connections';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import { can, getClient } from '@adxlens/core/tenancy';
import { entityTable } from '@adxlens/core/reporting';
import { Card, EmptyState, PageHeader, SourceFootnote, TabBar, tabItemClass } from '@adxlens/ui';
import { EntityTable } from '@/components/entity-table';
import { currentRanges } from '@/server/period';
import { ReconBadge } from '@/components/recon-badge';
import { worstRecon } from '@/lib/recon';
import { getPageContext } from '@/server/page-context';
import { ClientAccounts, ClientActions } from './client-detail';

const TABS = ['campaigns', 'adsets', 'ads', 'reports', 'settings'] as const;
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
            {recon.status !== 'pending' ? (
              <Link href={`/clients/${client.id}/reconciliation`} className="text-body font-normal">
                <ReconBadge status={recon.status} pct={recon.maxSpendDeltaPct} />
              </Link>
            ) : null}
          </span>
        }
        actions={canManage ? <ClientActions id={client.id} name={client.name} /> : null}
      />
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
          <EntityTable
            level={LEVEL[tab]}
            rows={await entityTable(
              pc.ctx,
              accounts.map((a) => a.id),
              LEVEL[tab],
              ranges.cur,
            )}
            currencyOf={Object.fromEntries(accounts.map((a) => [a.id, a.currency]))}
          />
          <SourceFootnote className="mt-2">{te('footnote', ranges.cur)}</SourceFootnote>
        </>
      ) : (
        <Card>
          <EmptyState title={t(`tabs.${tab}`)} description={t('c02NoData')} />
        </Card>
      )}
    </>
  );
}
