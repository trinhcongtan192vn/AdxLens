import { z } from 'zod';
import { listAdAccounts } from '@adxlens/core/connections';
import { reconciliationDetail } from '@adxlens/core/reconciliation';
import { daysBetween, notFound, AppError } from '@adxlens/core/shared';
import { route, uuidParam } from '@/server/route';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** D04: AdxLens so với Ads Manager theo từng chỉ số trong khoảng ngày. */
export const GET = route({
  auth: 'workspace',
  query: z.object({ from: isoDate, to: isoDate }),
  handler: async (ctx, { query }) => {
    const id = uuidParam(ctx, 'id');
    if (query.from > query.to || daysBetween(query.from, query.to) > 89) {
      throw new AppError('VALIDATION_FAILED', 'Khoảng ngày tối đa 90 ngày');
    }
    if (!(await listAdAccounts(ctx)).some((a) => a.id === id)) throw notFound('Tài khoản QC');
    const d = await reconciliationDetail(ctx, id, query);
    return {
      from: d.from,
      to: d.to,
      status: d.status,
      warning_dates: d.warningDates,
      last_checked_at: d.checkedAt?.toISOString() ?? null,
      metrics: d.metrics.map((m) => ({
        key: m.key,
        adxlens: m.internal,
        ads_manager: m.meta,
        diff: m.diff,
        delta_pct: m.deltaPct,
        ok: m.ok,
      })),
    };
  },
});
