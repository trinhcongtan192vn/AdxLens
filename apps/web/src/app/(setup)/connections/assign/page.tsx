import { getTranslations } from 'next-intl/server';
import { listAdAccounts } from '@adxlens/core/connections';
import { listClients } from '@adxlens/core/tenancy';
import { SetupShell } from '@/components/setup-shell';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { AssignAccounts } from './assign-accounts';

export async function generateMetadata() {
  const t = await getTranslations('clients');
  return { title: t('s05Title') };
}

/** S05 Gán tài khoản cho Client (bước 4/4) — Penpot. */
export default async function AssignPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'clients.manage');
  const t = await getTranslations('connect');
  const [accounts, clients] = await Promise.all([listAdAccounts(pc.ctx), listClients(pc.ctx)]);
  return (
    <SetupShell stepLabel={t('step', { n: 4, total: 4 })} width="lg">
      <AssignAccounts
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          metaAccountId: a.metaAccountId,
          clientId: a.clientId,
          suggestedClientName: a.suggestedClientName,
          assignmentStatus: a.assignmentStatus,
        }))}
      />
    </SetupShell>
  );
}
