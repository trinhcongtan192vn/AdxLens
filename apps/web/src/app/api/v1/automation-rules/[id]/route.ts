import { deleteRule, getRule, ruleEvaluationsFor } from '@adxlens/core/execution';
import { route, uuidParam } from '@/server/route';

/** P214 chi tiết rule + các lần đánh giá shadow / live gần nhất. */
export const GET = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  handler: async (ctx) => {
    const id = uuidParam(ctx, 'id');
    const r = await getRule(ctx, id);
    const evals = await ruleEvaluationsFor(ctx, id);
    return {
      id: r.id,
      name: r.name,
      mode: r.mode,
      level: r.level,
      condition: r.condition,
      action: r.action,
      shadow_started_at: r.shadowStartedAt,
      evaluations: evals.map((e) => ({
        mode: e.mode,
        as_of: e.asOfDate,
        evaluated_at: e.evaluatedAt,
        matched: e.matchedEntities.length,
        would_do: e.wouldDo,
        action_ids: e.actionIds,
      })),
    };
  },
});

export const DELETE = route({
  auth: 'workspace',
  permission: 'automation.manage',
  flag: 'p2b_auto',
  handler: async (ctx) => {
    await deleteRule(ctx, uuidParam(ctx, 'id'));
    return null;
  },
});
