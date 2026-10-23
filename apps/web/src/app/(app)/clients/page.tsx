import { getTranslations } from 'next-intl/server';
import { listClientOverview, unconfirmedCount } from '@adxlens/core/connections';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import { worstRecon } from '@/lib/recon';
import { can } from '@adxlens/core/tenancy';
import { getPageContext } from '@/server/page-context';
import { ClientsTable } from './clients-table';

export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('clients') };
}

/** C01 Clients (D, E, BR01) — Penpot. Chi tiêu/health điền từ 015+. */
export default async function ClientsPage() {
  const pc = await getPageContext();
  const [clients, unconfirmed] = await Promise.all([listClientOverview(pc.ctx), unconfirmedCount(pc.ctx)]);
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
