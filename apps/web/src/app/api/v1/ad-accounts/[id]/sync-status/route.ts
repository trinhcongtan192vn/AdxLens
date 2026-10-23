import { listAdAccounts } from '@adxlens/core/connections';
import { syncStatuses } from '@adxlens/core/ingestion';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import { notFound } from '@adxlens/core/shared';
import { route, uuidParam } from '@/server/route';

/** L3 10.2 `GET /ad-accounts/{id}/sync-status`; đối chiếu = 7 ngày tới hôm qua. */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => {
    const id = uuidParam(ctx, 'id');
    // listAdAccounts áp quyền theo Client (buyer chỉ thấy tài khoản được gán).
    if (!(await listAdAccounts(ctx)).some((a) => a.id === id)) throw notFound('Tài khoản QC');
    const s = (await syncStatuses(ctx, [id])).get(id)!;
    const rec = (await accountReconciliation(ctx, [id])).get(id)!;
    return {
      status: s.status,
      kind: s.kind,
      progress: { days_done: s.progress.daysDone, days_total: s.progress.daysTotal },
      error: s.error,
      last_synced_at: s.lastSyncedAt?.toISOString() ?? null,
      reconciliation: {
        status: rec.status,
        max_spend_delta_pct: rec.maxSpendDeltaPct,
        last_checked_at: rec.checkedAt?.toISOString() ?? null,
      },
    };
  },
});
