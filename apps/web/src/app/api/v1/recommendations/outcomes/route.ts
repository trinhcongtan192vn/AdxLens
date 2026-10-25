import { listOutcomes } from '@adxlens/core/recommendation';
import { route } from '@/server/route';

/** P105 Kết quả trước/sau của việc đã làm (P1-08). Sau cờ `p1_recommendations`. */
export const GET = route({
  auth: 'workspace',
  permission: 'insights.view',
  flag: 'p1_recommendations',
  handler: async (ctx) => ({
    items: (await listOutcomes(ctx)).map((o) => ({
      id: o.id,
      source_key: o.sourceKey,
      entity_name: o.entityName,
      account_name: o.accountName,
      currency: o.currency,
      done_date: o.doneDate,
      metric: o.metric,
      scope: o.scope,
      state: o.state,
      ready_on: o.readyOn,
      before: o.before,
      after: o.after,
      change_pct: o.changePct,
      improved: o.improved,
    })),
  }),
});
