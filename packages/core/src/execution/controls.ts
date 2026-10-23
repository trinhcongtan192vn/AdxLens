import { and, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { onFlagDisabled, registerFlagCheck } from '@adxlens/core/flags';
import { getGlobalKillSwitch, latestExecutionCheck } from '@adxlens/core/ops';
import { AppError, systemClock, type ActorCtx, type Clock } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { effectiveGuardrails } from './guardrails';
import { cancelPending, killSwitchState } from './safety';

const { killSwitches, circuitBreakers, metaConnections, auditEvents, actions } = schema;

/** P205 kill switch của workspace (Owner). Bật → hủy mọi hành động đang chờ ngay. Có ghi audit. */
export async function setWorkspaceKillSwitch(
  ctx: ActorCtx,
  input: { active: boolean; reason: string },
  clock: Clock = systemClock,
): Promise<{ canceled: number }> {
  assertCan(ctx.actor, 'guardrails.manage');
  const reason = input.reason.trim();
  if (input.active && reason.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần lý do (≥ 5 ký tự)');
  const now = clock.now();
  await ctx.db
    .insert(killSwitches)
    .values({
      scopeKey: ctx.workspaceId,
      workspaceId: ctx.workspaceId,
      active: input.active,
      reason,
      changedBy: ctx.actor.userId,
      changedAt: now,
    })
    .onConflictDoUpdate({
      target: killSwitches.scopeKey,
      set: { active: input.active, reason, changedBy: ctx.actor.userId, changedAt: now },
    });
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: input.active ? 'kill_switch.on' : 'kill_switch.off',
    detail: { reason },
  });
  return { canceled: input.active ? await cancelPending(ctx, 'kill_switch') : 0 };
}

/** P205: trạng thái kill switch + circuit breaker của từng tài khoản. */
export async function executionControls(ctx: ActorCtx) {
  assertCan(ctx.actor, 'guardrails.manage');
  const [k] = await ctx.db.select().from(killSwitches).where(eq(killSwitches.scopeKey, ctx.workspaceId));
  const state = await killSwitchState(ctx);
  const accounts = new Map((await listAdAccounts(ctx)).map((a) => [a.id, a.name]));
  const breakers = await ctx.db.select().from(circuitBreakers).where(eq(circuitBreakers.workspaceId, ctx.workspaceId));
  return {
    workspace: { active: state.workspace, reason: k?.reason ?? null, changedAt: k?.changedAt ?? null },
    global: state.global,
    breakers: breakers
      .filter((b) => b.open || b.consecutiveFailures > 0)
      .map((b) => ({
        adAccountId: b.adAccountId,
        accountName: accounts.get(b.adAccountId) ?? b.adAccountId,
        open: b.open,
        failures: b.consecutiveFailures,
        openedAt: b.openedAt,
      })),
  };
}

/** Owner đóng circuit breaker sau khi đã xử lý nguyên nhân (đặt lại bộ đếm). */
export async function closeBreaker(ctx: ActorCtx, adAccountId: string, clock: Clock = systemClock): Promise<void> {
  assertCan(ctx.actor, 'guardrails.manage');
  const rows = await ctx.db
    .update(circuitBreakers)
    .set({ open: false, consecutiveFailures: 0, closedBy: ctx.actor.userId, closedAt: clock.now() })
    .where(and(eq(circuitBreakers.workspaceId, ctx.workspaceId), eq(circuitBreakers.adAccountId, adAccountId)))
    .returning({ id: circuitBreakers.adAccountId });
  if (!rows.length) throw new AppError('NOT_FOUND', 'Không tìm thấy');
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'circuit_breaker.closed',
    detail: { adAccountId },
  });
}

let registered = false;

/**
 * Đăng ký với core/flags (gọi một lần ở web và worker): checklist kỹ thuật cờ `p2a_approve` (L3 18.3) và việc
 * khi tắt cờ — hủy mọi hành động đang chờ (L3 18.1).
 */
export function registerExecutionHooks(opts: { appVersion: string; clock?: Clock }): void {
  if (registered) return;
  registered = true;
  const version = () => opts.appVersion;
  registerFlagCheck('p2a_approve', {
    id: 'write_scope',
    label: 'Có kết nối Meta đã cấp quyền ghi (ads_management)',
    run: async (db, workspaceId) => {
      const rows = await db
        .select({ scopes: metaConnections.scopes, enabled: metaConnections.writeEnabled })
        .from(metaConnections)
        .where(and(eq(metaConnections.workspaceId, workspaceId), eq(metaConnections.status, 'active')));
      return rows.some((r) => r.enabled && r.scopes.includes('ads_management'))
        ? { passed: true }
        : { passed: false, detail: 'Chưa có kết nối được cấp quyền ghi' };
    },
  });
  registerFlagCheck('p2a_approve', {
    id: 'staging_check',
    label: 'Test tích hợp ghi (execution:check) của bản deploy hiện tại đạt mọi action_type',
    run: async (db) => {
      const c = await latestExecutionCheck(db, version());
      if (!c) return { passed: false, detail: `Chưa chạy cho phiên bản ${version()}` };
      return c.passed
        ? { passed: true, detail: c.ranAt.toISOString() }
        : { passed: false, detail: 'Lần chạy gần nhất có lỗi' };
    },
  });
  registerFlagCheck('p2a_approve', {
    id: 'global_kill_switch_off',
    label: 'Kill switch toàn cục đang tắt',
    run: async (db) =>
      (await getGlobalKillSwitch(db)).active ? { passed: false, detail: 'Đang bật' } : { passed: true },
  });
  registerFlagCheck('p2a_approve', {
    id: 'guardrails_configured',
    label: 'Guardrails của workspace đã được Owner xem và lưu',
    run: async (db, workspaceId) =>
      (await effectiveGuardrails({ db, workspaceId })).configured
        ? { passed: true }
        : { passed: false, detail: 'Owner chưa lưu guardrails (P205)' },
  });
  for (const key of ['p2a_approve', 'p2b_auto'] as const) {
    onFlagDisabled(key, async (db, workspaceId) => {
      const conds = [eq(actions.workspaceId, workspaceId), eq(actions.status, 'pending')];
      if (key === 'p2b_auto') conds.push(eq(actions.tier, 'auto'));
      const rows = await db
        .update(actions)
        .set({ status: 'canceled', resultCode: 'feature_disabled', updatedAt: (opts.clock ?? systemClock).now() })
        .where(and(...conds))
        .returning({ id: actions.id });
      if (rows.length) {
        await db.insert(schema.actionLogs).values(
          rows.map((r) => ({
            workspaceId,
            actionId: r.id,
            event: 'canceled',
            detail: { reason: 'feature_disabled' },
          })),
        );
      }
    });
  }
}
