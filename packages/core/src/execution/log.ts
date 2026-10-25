import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { listAdAccounts } from '@adxlens/core/connections';
import { AppError, type ActorCtx, type Clock } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { requestAction, UNDOABLE, type ActionRow } from './gateway';
import type { ActionType } from './guardrails';

const { actions, actionLogs, users } = schema;

/** P203 Nhật ký hành động (P2-05): ai, khi nào, gì, vì sao, kết quả, hoàn tác. Theo phạm vi Client. */
export async function listActions(
  ctx: ActorCtx,
  opts: {
    status?: (typeof schema.ACTION_STATUSES)[number];
    adAccountId?: string;
    /** G3: chỉ tài khoản của Client này. */
    clientId?: string;
    limit?: number;
  } = {},
) {
  assertCan(ctx.actor, 'actions.view');
  const accounts = await listAdAccounts(ctx, { includeRevoked: true, clientId: opts.clientId });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const ids = opts.adAccountId ? [opts.adAccountId].filter((id) => byId.has(id)) : [...byId.keys()];
  if (!ids.length) return [];
  const conds = [eq(actions.workspaceId, ctx.workspaceId), inArray(actions.adAccountId, ids)];
  if (opts.status) conds.push(eq(actions.status, opts.status));
  const rows = await ctx.db
    .select({ a: actions, approverName: users.fullName, approverEmail: users.email })
    .from(actions)
    .leftJoin(users, eq(users.id, actions.approvedBy))
    .where(and(...conds))
    .orderBy(desc(actions.createdAt))
    .limit(opts.limit ?? 100);
  return rows.map(({ a, approverName, approverEmail }) => ({
    ...a,
    accountName: byId.get(a.adAccountId)!.name,
    currency: byId.get(a.adAccountId)!.currency,
    approverName: a.approvedBy ? (approverName ?? approverEmail) : null,
    undoable: canUndo(a),
  }));
}

function canUndo(a: ActionRow): boolean {
  return a.status === 'success' && UNDOABLE[a.actionType as ActionType] && a.resultCode !== 'no_change';
}

/** P204 Chi tiết hành động + dòng thời gian nhật ký. */
export async function getAction(ctx: ActorCtx, id: string) {
  assertCan(ctx.actor, 'actions.view');
  const [a] = await ctx.db
    .select()
    .from(actions)
    .where(and(eq(actions.workspaceId, ctx.workspaceId), eq(actions.id, id)));
  const account = a && (await listAdAccounts(ctx, { includeRevoked: true })).find((x) => x.id === a.adAccountId);
  if (!a || !account) throw new AppError('NOT_FOUND', 'Không tìm thấy hành động');
  const logs = await ctx.db
    .select({ event: actionLogs.event, detail: actionLogs.detail, at: actionLogs.at })
    .from(actionLogs)
    .where(and(eq(actionLogs.workspaceId, ctx.workspaceId), eq(actionLogs.actionId, a.id)))
    .orderBy(asc(actionLogs.id));
  const [undoBy] = await ctx.db
    .select({ id: actions.id, status: actions.status })
    .from(actions)
    .where(and(eq(actions.workspaceId, ctx.workspaceId), eq(actions.undoOf, a.id)))
    .orderBy(desc(actions.createdAt))
    .limit(1);
  return {
    ...a,
    accountName: account.name,
    currency: account.currency,
    clientId: account.clientId,
    logs,
    undoAction: undoBy ?? null,
    undoable: canUndo(a) && (!undoBy || undoBy.status === 'failed' || undoBy.status === 'canceled'),
  };
}

const INVERSE: Partial<Record<ActionType, ActionType>> = {
  pause_ad: 'resume_ad',
  resume_ad: 'pause_ad',
  pause_adset: 'resume_adset',
  resume_adset: 'pause_adset',
  pause_campaign: 'resume_campaign',
  resume_campaign: 'pause_campaign',
  set_adset_budget: 'set_adset_budget',
};

/**
 * P2-06 Hoàn tác: một hành động MỚI đưa đối tượng về `before_state` của hành động gốc, đi qua đúng Execution
 * Gateway (quyền, kill switch, guardrails). Nhân bản không hoàn tác được (ADR-0011).
 */
export async function undoAction(ctx: ActorCtx, id: string, deps: { enqueue: Enqueue; clock?: Clock }) {
  const a = await getAction(ctx, id);
  if (!a.undoable) throw new AppError('CONFLICT', 'Hành động này không hoàn tác được');
  const type = a.actionType as ActionType;
  const inverse = INVERSE[type];
  if (!inverse) throw new AppError('CONFLICT', 'Hành động này không hoàn tác được');
  return requestAction(
    ctx,
    {
      adAccountId: a.adAccountId,
      actionType: inverse,
      targetMetaId: a.targetMetaId,
      newDailyBudget: type === 'set_adset_budget' ? (a.beforeState.daily_budget ?? null) : null,
      recommendationId: a.recommendationId,
      undoOf: a.id,
    },
    deps,
  );
}
