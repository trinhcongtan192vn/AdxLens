import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { forbidden, systemClock, type Clock } from '@adxlens/core/shared';
import { openIncident } from './incidents';
import { recordAdminAction, type StaffActor } from './staff';

const { killSwitches, actions, actionLogs, opsExecutionChecks, auditEvents } = schema;

export const GLOBAL_KILL_SWITCH = 'global';

export async function getGlobalKillSwitch(db: DbOrTx) {
  const [r] = await db.select().from(killSwitches).where(eq(killSwitches.scopeKey, GLOBAL_KILL_SWITCH));
  return { active: Boolean(r?.active), reason: r?.reason ?? null, changedAt: r?.changedAt ?? null };
}

/**
 * Kill switch TOÀN CỤC (AD04, ADR-0008 mục 7) — truy vấn XUYÊN WORKSPACE có chủ đích: bật thì hủy mọi hành
 * động đang chờ của mọi workspace (ghi nhật ký từng hành động). Chỉ staff (route kiểm) hoặc CLI dự phòng.
 */
/**
 * AD04 từ trang admin (ADR-0013): operator chỉ được BẬT (dừng khẩn cấp), tắt cần superadmin. Ghi nhật ký admin.
 */
export async function setGlobalKillSwitchByStaff(
  db: DbOrTx,
  actor: StaffActor,
  input: { active: boolean; reason: string },
  clock: Clock = systemClock,
): Promise<{ canceled: number }> {
  if (!input.active && actor.role !== 'superadmin') throw forbidden('Chỉ superadmin được tắt kill switch toàn cục');
  const r = await setGlobalKillSwitch(db, { ...input, changedBy: actor.userId }, clock);
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: input.active ? 'kill_switch.on' : 'kill_switch.off',
    targetType: 'kill_switch',
    targetId: GLOBAL_KILL_SWITCH,
    reason: input.reason,
    detail: { canceled: r.canceled },
  });
  return r;
}

export async function setGlobalKillSwitch(
  db: DbOrTx,
  input: { active: boolean; reason: string; changedBy: string | null },
  clock: Clock = systemClock,
): Promise<{ canceled: number }> {
  const now = clock.now();
  await db
    .insert(killSwitches)
    .values({
      scopeKey: GLOBAL_KILL_SWITCH,
      active: input.active,
      reason: input.reason,
      changedBy: input.changedBy,
      changedAt: now,
    })
    .onConflictDoUpdate({
      target: killSwitches.scopeKey,
      set: { active: input.active, reason: input.reason, changedBy: input.changedBy, changedAt: now },
    });
  let canceled = 0;
  if (input.active) {
    const rows = await db
      .update(actions)
      .set({ status: 'canceled', resultCode: 'kill_switch', updatedAt: now })
      .where(eq(actions.status, 'pending'))
      .returning({ id: actions.id, workspaceId: actions.workspaceId });
    if (rows.length) {
      await db.insert(actionLogs).values(
        rows.map((r) => ({
          workspaceId: r.workspaceId,
          actionId: r.id,
          event: 'canceled',
          detail: { reason: 'kill_switch_global' },
        })),
      );
    }
    canceled = rows.length;
    await openIncident(db, {
      kind: 'kill_switch',
      severity: 'P1',
      source: 'execution',
      title: 'Kill switch toàn cục đang bật',
      fingerprint: 'kill_switch:global',
      detail: { reason: input.reason, canceled },
    });
  }
  return { canceled };
}

/** CLI dự phòng: bật/tắt kill switch của một workspace khi giao diện không dùng được (ghi audit). */
export async function setWorkspaceKillSwitchSystem(
  db: DbOrTx,
  workspaceId: string,
  input: { active: boolean; reason: string },
  clock: Clock = systemClock,
): Promise<{ canceled: number }> {
  const now = clock.now();
  await db
    .insert(killSwitches)
    .values({
      scopeKey: workspaceId,
      workspaceId,
      active: input.active,
      reason: input.reason,
      changedBy: null,
      changedAt: now,
    })
    .onConflictDoUpdate({
      target: killSwitches.scopeKey,
      set: { active: input.active, reason: input.reason, changedBy: null, changedAt: now },
    });
  let canceled = 0;
  if (input.active) {
    const rows = await db
      .update(actions)
      .set({ status: 'canceled', resultCode: 'kill_switch', updatedAt: now })
      .where(and(eq(actions.workspaceId, workspaceId), eq(actions.status, 'pending')))
      .returning({ id: actions.id });
    if (rows.length) {
      await db
        .insert(actionLogs)
        .values(
          rows.map((r) => ({ workspaceId, actionId: r.id, event: 'canceled', detail: { reason: 'kill_switch_cli' } })),
        );
    }
    canceled = rows.length;
  }
  await db.insert(auditEvents).values({
    workspaceId,
    actorUserId: null,
    event: input.active ? 'kill_switch.on' : 'kill_switch.off',
    detail: { via: 'cli', reason: input.reason },
  });
  return { canceled };
}

/** Lưu kết quả `pnpm execution:check` (dữ liệu vận hành). */
export async function recordExecutionCheck(
  db: DbOrTx,
  input: { appVersion: string; appEnv: string; passed: boolean; steps: { action: string; ok: boolean }[] },
) {
  await db.insert(opsExecutionChecks).values(input);
}

export async function latestExecutionCheck(db: DbOrTx, appVersion: string) {
  const [r] = await db
    .select()
    .from(opsExecutionChecks)
    .where(eq(opsExecutionChecks.appVersion, appVersion))
    .orderBy(desc(opsExecutionChecks.ranAt))
    .limit(1);
  return r ?? null;
}

/**
 * Rule tự động cần đánh giá (P2b): truy vấn XUYÊN WORKSPACE có chủ đích cho scheduler — chỉ trả định danh;
 * mỗi job sau đó chạy trong đúng workspace và tự kiểm cờ.
 */
export async function activeAutomationRules(db: DbOrTx) {
  const { automationRules } = schema;
  return db
    .select({ id: automationRules.id, workspaceId: automationRules.workspaceId, mode: automationRules.mode })
    .from(automationRules)
    .where(inArray(automationRules.mode, ['shadow', 'live']));
}

/**
 * Lịch hẹn của rule đến hạn (ADR-0021). TRUY VẤN XUYÊN WORKSPACE có chủ đích (quy tắc 1, chỉ ở `core/ops`): job định
 * kỳ chỉ lấy id + workspace; xử lý từng lịch chạy trong ngữ cảnh workspace của nó.
 */
export async function dueReverts(db: DbOrTx, now: Date, limit = 500) {
  const { scheduledReverts } = schema;
  return db
    .select({ id: scheduledReverts.id, workspaceId: scheduledReverts.workspaceId })
    .from(scheduledReverts)
    .where(and(eq(scheduledReverts.status, 'pending'), lte(scheduledReverts.dueAt, now)))
    .limit(limit);
}
