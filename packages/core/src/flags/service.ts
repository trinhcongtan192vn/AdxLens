import { and, desc, eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { AppError, forbidden, systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { checksFor, disabledHandlersFor, type ChecklistItemResult, type FlagKey } from './registry';

const { featureFlags, flagChangeLog, staff, workspaces } = schema;

export const FLAG_KEYS = schema.FLAG_KEYS;

/** Phụ thuộc giữa cờ (L3 18.1): cờ con cần cờ cha đang bật. */
export const FLAG_PARENT: Record<FlagKey, FlagKey | null> = {
  p0_reports: null,
  p1_recommendations: 'p0_reports',
  p2a_approve: 'p1_recommendations',
  p2b_auto: 'p2a_approve',
};

export function dependentsOf(key: FlagKey): FlagKey[] {
  const out: FlagKey[] = [];
  for (const k of FLAG_KEYS) {
    let p = FLAG_PARENT[k];
    while (p) {
      if (p === key) {
        out.push(k);
        break;
      }
      p = FLAG_PARENT[p];
    }
  }
  return out;
}

/** Cache cờ (Redis 60 giây ở web/worker, L3 18.1). Core chỉ biết interface. */
export type FlagCache = {
  get: (key: string) => Promise<boolean | undefined>;
  set: (key: string, value: boolean, ttlSeconds: number) => Promise<void>;
  del: (key: string) => Promise<void>;
};

export const FLAG_CACHE_TTL_SECONDS = 60;
const cacheKey = (workspaceId: string, key: FlagKey) => `flag:${workspaceId}:${key}`;

let cache: FlagCache | null = null;
export function setFlagCache(c: FlagCache | null): void {
  cache = c;
}

async function readFlag(db: DbOrTx, workspaceId: string, key: FlagKey): Promise<boolean> {
  const [row] = await db
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(and(eq(featureFlags.workspaceId, workspaceId), eq(featureFlags.flagKey, key)));
  return row?.enabled ?? false;
}

/** Cờ có đang bật cho workspace không. Mặc định tắt khi chưa có bản ghi. */
export async function isEnabled(ctx: WorkspaceCtx, key: FlagKey): Promise<boolean> {
  const ck = cacheKey(ctx.workspaceId, key);
  const cached = cache ? await cache.get(ck) : undefined;
  if (cached !== undefined) return cached;
  const value = await readFlag(ctx.db, ctx.workspaceId, key);
  await cache?.set(ck, value, FLAG_CACHE_TTL_SECONDS);
  return value;
}

/**
 * Dùng ở đầu route API và đầu job của P1/P2 (CLAUDE.md quy tắc 7). Cờ tắt → 404, không tiết lộ
 * tên cờ trong thông điệp trả cho khách.
 */
export async function assertEnabled(ctx: WorkspaceCtx, key: FlagKey): Promise<void> {
  if (!(await isEnabled(ctx, key))) {
    throw new AppError('FEATURE_DISABLED', 'Không tìm thấy', { feature: 'unavailable' });
  }
}

export async function getFlags(ctx: WorkspaceCtx): Promise<Record<FlagKey, boolean>> {
  const rows = await ctx.db
    .select({ key: featureFlags.flagKey, enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.workspaceId, ctx.workspaceId));
  const out = Object.fromEntries(FLAG_KEYS.map((k) => [k, false])) as Record<FlagKey, boolean>;
  for (const r of rows) out[r.key] = r.enabled;
  return out;
}

// ---------- Thay đổi cờ: chỉ staff, qua đây (L3 18.2) ----------

async function staffOf(db: DbOrTx, userId: string) {
  const [s] = await db.select().from(staff).where(eq(staff.userId, userId));
  return s ?? null;
}

export async function runChecklist(db: DbOrTx, workspaceId: string, key: FlagKey): Promise<ChecklistItemResult[]> {
  const out: ChecklistItemResult[] = [];
  const parent = FLAG_PARENT[key];
  if (parent) {
    out.push({
      id: 'parent_enabled',
      label: `Cờ phụ thuộc ${parent} đang bật`,
      passed: await readFlag(db, workspaceId, parent),
    });
  }
  for (const c of checksFor(key)) {
    try {
      const r = await c.run(db, workspaceId);
      out.push({
        id: c.id,
        label: c.label,
        passed: r.passed,
        ...(r.detail ? { detail: r.detail } : {}),
      });
    } catch {
      out.push({ id: c.id, label: c.label, passed: false, detail: 'Kiểm tra lỗi khi chạy' });
    }
  }
  return out;
}

export type EnableFlagInput = {
  workspaceId: string;
  key: FlagKey;
  staffUserId: string;
  reason: string;
  /** PM vượt checklist (PRD 6.1, quyết định 22/10/2026): bắt buộc có lý do, được ghi log. */
  override?: boolean;
};

export async function enableFlag(db: Db, input: EnableFlagInput, clock: Clock = systemClock) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  const s = await staffOf(db, input.staffUserId);
  if (!s?.canEnableFlags) throw forbidden('Chỉ PM được bật cờ');

  return db.transaction(async (tx) => {
    const [ws] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, input.workspaceId));
    if (!ws) throw new AppError('NOT_FOUND', 'Workspace không tồn tại');

    const checklist = await runChecklist(tx, input.workspaceId, input.key);
    const parentFailed = checklist.some((c) => c.id === 'parent_enabled' && !c.passed);
    // Không vượt được phụ thuộc giữa cờ: bật cờ con khi cờ cha tắt là trạng thái không hợp lệ.
    if (parentFailed) throw new AppError('CONFLICT', 'Cờ phụ thuộc chưa bật', { checklist });
    const allPassed = checklist.every((c) => c.passed);
    if (!allPassed && !input.override) {
      throw new AppError('CONFLICT', 'Checklist kỹ thuật chưa đạt', { checklist });
    }

    const old = await readFlag(tx, input.workspaceId, input.key);
    const now = clock.now();
    await tx
      .insert(featureFlags)
      .values({
        workspaceId: input.workspaceId,
        flagKey: input.key,
        enabled: true,
        enabledBy: input.staffUserId,
        enabledAt: now,
        reason,
      })
      .onConflictDoUpdate({
        target: [featureFlags.workspaceId, featureFlags.flagKey],
        set: { enabled: true, enabledBy: input.staffUserId, enabledAt: now, reason },
      });
    await tx.insert(flagChangeLog).values({
      workspaceId: input.workspaceId,
      flagKey: input.key,
      oldValue: old,
      newValue: true,
      changedBy: input.staffUserId,
      reason,
      checklistResult: checklist,
      override: !allPassed,
      at: now,
    });
    await cache?.del(cacheKey(input.workspaceId, input.key));
    return { checklist, override: !allPassed };
  });
}

/** Tắt cờ (mọi staff). Tắt luôn cờ phụ thuộc; dữ liệu giữ nguyên (PRD 7.8). */
export async function disableFlag(
  db: Db,
  input: { workspaceId: string; key: FlagKey; staffUserId: string; reason: string },
  clock: Clock = systemClock,
): Promise<FlagKey[]> {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  if (!(await staffOf(db, input.staffUserId))) throw forbidden('Chỉ đội AdxLens được tắt cờ');

  const turnedOff: FlagKey[] = [];
  await db.transaction(async (tx) => {
    for (const key of [input.key, ...dependentsOf(input.key)]) {
      const old = await readFlag(tx, input.workspaceId, key);
      if (!old) continue;
      await tx
        .update(featureFlags)
        .set({ enabled: false, reason })
        .where(and(eq(featureFlags.workspaceId, input.workspaceId), eq(featureFlags.flagKey, key)));
      await tx.insert(flagChangeLog).values({
        workspaceId: input.workspaceId,
        flagKey: key,
        oldValue: true,
        newValue: false,
        changedBy: input.staffUserId,
        reason: key === input.key ? reason : `Tắt theo ${input.key}: ${reason}`,
        checklistResult: [],
        at: clock.now(),
      });
      for (const h of disabledHandlersFor(key)) await h(tx, input.workspaceId);
      turnedOff.push(key);
    }
  });
  for (const key of turnedOff) await cache?.del(cacheKey(input.workspaceId, key));
  return turnedOff;
}

export async function flagHistory(db: DbOrTx, workspaceId: string, limit = 50) {
  return db
    .select()
    .from(flagChangeLog)
    .where(eq(flagChangeLog.workspaceId, workspaceId))
    .orderBy(desc(flagChangeLog.at), desc(flagChangeLog.id))
    .limit(limit);
}
