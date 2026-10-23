import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';

const { killSwitches, circuitBreakers, actions, actionLogs } = schema;

export const GLOBAL_SCOPE = 'global';

/**
 * Trạng thái kill switch (ADR-0008 mục 7). Đọc dòng 'global' là truy vấn XUYÊN WORKSPACE có chủ đích: một
 * công tắc của hệ thống áp cho mọi workspace; không chứa dữ liệu nghiệp vụ.
 */
export async function killSwitchState(ctx: WorkspaceCtx): Promise<{ global: boolean; workspace: boolean }> {
  const rows = await ctx.db
    .select({ scopeKey: killSwitches.scopeKey, active: killSwitches.active })
    .from(killSwitches)
    .where(inArray(killSwitches.scopeKey, [GLOBAL_SCOPE, ctx.workspaceId]));
  return {
    global: rows.some((r) => r.scopeKey === GLOBAL_SCOPE && r.active),
    workspace: rows.some((r) => r.scopeKey === ctx.workspaceId && r.active),
  };
}

export async function breakerOpen(ctx: WorkspaceCtx, adAccountId: string): Promise<boolean> {
  const [b] = await ctx.db
    .select({ open: circuitBreakers.open })
    .from(circuitBreakers)
    .where(and(eq(circuitBreakers.workspaceId, ctx.workspaceId), eq(circuitBreakers.adAccountId, adAccountId)));
  return Boolean(b?.open);
}

/** Thành công → đặt lại bộ đếm. */
export async function recordSuccess(ctx: WorkspaceCtx, adAccountId: string): Promise<void> {
  await ctx.db
    .insert(circuitBreakers)
    .values({ workspaceId: ctx.workspaceId, adAccountId, consecutiveFailures: 0 })
    .onConflictDoUpdate({ target: circuitBreakers.adAccountId, set: { consecutiveFailures: 0 } });
}

/** Thất bại → tăng bộ đếm; chạm ngưỡng → mở breaker. Trả `true` nếu vừa mở. */
export async function recordFailure(
  ctx: WorkspaceCtx,
  adAccountId: string,
  threshold: number,
  clock: Clock = systemClock,
): Promise<boolean> {
  const [cur] = await ctx.db
    .select()
    .from(circuitBreakers)
    .where(and(eq(circuitBreakers.workspaceId, ctx.workspaceId), eq(circuitBreakers.adAccountId, adAccountId)));
  const failures = (cur?.consecutiveFailures ?? 0) + 1;
  const opening = !cur?.open && failures >= threshold;
  const values = {
    consecutiveFailures: failures,
    open: cur?.open || opening,
    ...(opening ? { openedAt: clock.now(), closedBy: null, closedAt: null } : {}),
  };
  await ctx.db
    .insert(circuitBreakers)
    .values({ workspaceId: ctx.workspaceId, adAccountId, ...values })
    .onConflictDoUpdate({ target: circuitBreakers.adAccountId, set: values });
  return opening;
}

/** Hủy mọi hành động đang chờ của workspace (kill switch bật, cờ tắt, breaker mở). */
export async function cancelPending(
  ctx: WorkspaceCtx,
  reason: string,
  opts: { adAccountId?: string } = {},
): Promise<number> {
  const conds = [eq(actions.workspaceId, ctx.workspaceId), eq(actions.status, 'pending')];
  if (opts.adAccountId) conds.push(eq(actions.adAccountId, opts.adAccountId));
  const rows = await ctx.db
    .update(actions)
    .set({ status: 'canceled', resultCode: reason, updatedAt: new Date() })
    .where(and(...conds))
    .returning({ id: actions.id });
  if (rows.length) {
    await ctx.db
      .insert(actionLogs)
      .values(
        rows.map((r) => ({ workspaceId: ctx.workspaceId, actionId: r.id, event: 'canceled', detail: { reason } })),
      );
  }
  return rows.length;
}
