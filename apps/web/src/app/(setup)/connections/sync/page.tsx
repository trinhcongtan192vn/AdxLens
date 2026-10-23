import { getTranslations } from 'next-intl/server';
import { listAdAccounts } from '@adxlens/core/connections';
import { syncStatuses } from '@adxlens/core/ingestion';
import { SetupShell } from '@/components/setup-shell';
import { requirePermission } from '@/server/guards';
import { getPageContext } from '@/server/page-context';
import { SyncProgress } from './sync-progress';

export async function generateMetadata() {
  const t = await getTranslations('sync');
  return { title: t('title') };
}

/** S06 Tiến độ đồng bộ (L, P, X) — Penpot. Cột đối chiếu điền ở 013. */
export default async function SyncPage() {
  const pc = await getPageContext();
  requirePermission(pc, 'connections.manage');
  const t = await getTranslations('connect');
  const accounts = await listAdAccounts(pc.ctx);
  const statuses = await syncStatuses(
    pc.ctx,
    accounts.map((a) => a.id),
  );
  return (
    <SetupShell stepLabel={t('step', { n: 4, total: 4 })} width="md">
      <SyncProgress
        accounts={accounts.map((a) => {
          const s = statuses.get(a.id)!;
          return {
            id: a.id,
            name: a.name,
            status: s.status,
            daysDone: s.progress.daysDone,
            daysTotal: s.progress.daysTotal,
            error: s.error,
          };
        })}
      />
    </SetupShell>
  );
}
