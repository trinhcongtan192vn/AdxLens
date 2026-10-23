import { and, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { systemClock, type ActorCtx, type Clock } from '@adxlens/core/shared';
import { listWeeklyActions } from './weekly';

const { memberships } = schema;

/**
 * A08 Onboarding theo vai trò cho media buyer (P1-11): không bắt cấu hình gì — chỉ cho thấy Client được
 * giao, số việc tuần này và việc được gán cho mình, rồi dẫn tới Việc tuần này / Creative.
 * Trả `null` khi không áp dụng (không phải buyer hoặc đã đóng).
 */
export async function buyerOnboarding(ctx: ActorCtx) {
  if (ctx.actor.role !== 'buyer') return null;
  const [m] = await ctx.db
    .select({ onboardedAt: memberships.onboardedAt })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, ctx.actor.userId)));
  if (!m || m.onboardedAt) return null;
  const accounts = (await listAdAccounts(ctx)).filter((a) => a.connectionStatus !== 'revoked');
  const clients = [
    ...new Map(accounts.filter((a) => a.clientId).map((a) => [a.clientId!, a.clientName ?? ''])).entries(),
  ].map(([id, name]) => ({ id, name, accounts: accounts.filter((a) => a.clientId === id).length }));
  const weekly = await listWeeklyActions(ctx);
  return {
    clients,
    weekItems: weekly.items.filter((i) => i.status === 'proposed' || i.status === 'in_progress').length,
    assignedToMe: weekly.items.filter((i) => i.assigneeId === ctx.actor.userId && i.status !== 'done').length,
  };
}

/** Đóng màn chào mừng (chỉ của chính người dùng trong workspace này). */
export async function dismissOnboarding(ctx: ActorCtx, clock: Clock = systemClock): Promise<void> {
  await ctx.db
    .update(memberships)
    .set({ onboardedAt: clock.now() })
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, ctx.actor.userId)));
}
