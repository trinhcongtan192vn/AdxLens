import { getTranslations } from 'next-intl/server';
import { listClientOverview, unconfirmedCount } from '@adxlens/core/connections';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import { agencyOverview, clientGoalStatus, listClientGoals } from '@adxlens/core/reporting';
import { worstRecon } from '@/lib/recon';
import { can } from '@adxlens/core/tenancy';
import { getPageContext } from '@/server/page-context';
import { ClientsTable } from './clients-table';

export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('clients') };
}

/** C01 Clients (D, E, BR01) — Penpot. Cột báo cáo cuối điền ở 019+. */
export default async function ClientsPage() {
  const pc = await getPageContext();
  const [clients, unconfirmed] = await Promise.all([listClientOverview(pc.ctx), unconfirmedCount(pc.ctx)]);
  const overview = new Map((await agencyOverview(pc.ctx)).clients.map((c) => [c.id, c]));
  const [goals, goalStatus] = await Promise.all([listClientGoals(pc.ctx), clientGoalStatus(pc.ctx)]);
  const recon = await accountReconciliation(
    pc.ctx,
    clients.flatMap((c) => c.accounts.map((a) => a.id)),
  );
  return (
    <ClientsTable
      canManage={can(pc.ctx.actor.role, 'clients.manage')}
      unconfirmed={unconfirmed}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        spend30: overview.get(c.id)?.spend30 ?? {},
        health: overview.get(c.id)?.health ?? null,
        highIssues: overview.get(c.id)?.highIssues ?? 0,
        goalMetric: goals.get(c.id)?.primaryMetric ?? null,
        goalVsPct: goalStatus.get(c.id)?.vsTargetPct ?? null,
        recon: worstRecon(c.accounts.map((a) => recon.get(a.id)!).filter(Boolean)),
        accounts: c.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          metaAccountId: a.metaAccountId,
          confirmed: a.assignmentStatus === 'confirmed',
          expired: a.connectionStatus !== 'active',
        })),
      }))}
    />
  );
}
