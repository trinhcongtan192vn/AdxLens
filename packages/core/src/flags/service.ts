import { and, desc, eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { currentPlanKey, PLAN_KEYS, type PlanKey } from '@adxlens/core/billing';
import { AppError, forbidden, systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { checksFor, disabledHandlersFor, type ChecklistItemResult, type FlagKey } from './registry';

const { featureFlags, flagChangeLog, flagGlobal, planFlags, flagScopeLog, staff, workspaces } = schema;

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

/** Ngoại lệ của workspace (ADR-0024): true = bật thêm, false = tắt riêng, null = theo toàn app × gói. */
async function readOverride(db: DbOrTx, workspaceId: string, key: FlagKey): Promise<boolean | null> {
  const [row] = await db
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(and(eq(featureFlags.workspaceId, workspaceId), eq(featureFlags.flagKey, key)));
  return row ? row.enabled : null;
}

/** Ma trận gói mặc định (ADR-0024) = bảng giá hiện tại; superadmin sửa ở /admin/flags (bảng `plan_flags`). */
export const DEFAULT_PLAN_FLAGS: Record<PlanKey, readonly FlagKey[]> = {
  free: ['p0_reports'],
  starter: ['p0_reports', 'p1_recommendations'],
  growth: ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'],
  scale: ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'],
};

export type FlagScopes = {
  global: Record<FlagKey, boolean>;
  plans: Record<PlanKey, Record<FlagKey, boolean>>;
};

/** Cờ toàn app + ma trận gói (thiếu dòng = mặc định: toàn app tắt, gói theo DEFAULT_PLAN_FLAGS). */
export async function readFlagScopes(db: DbOrTx): Promise<FlagScopes> {
  const [g, p] = await Promise.all([db.select().from(flagGlobal), db.select().from(planFlags)]);
  const global = Object.fromEntries(FLAG_KEYS.map((k) => [k, false])) as Record<FlagKey, boolean>;
  for (const r of g) global[r.flagKey] = r.enabled;
  const plans = Object.fromEntries(
    PLAN_KEYS.map((pk) => [pk, Object.fromEntries(FLAG_KEYS.map((k) => [k, DEFAULT_PLAN_FLAGS[pk].includes(k)]))]),
  ) as FlagScopes['plans'];
  for (const r of p) {
    if ((PLAN_KEYS as readonly string[]).includes(r.planKey)) plans[r.planKey as PlanKey][r.flagKey] = r.enabled;
  }
  return { global, plans };
}

/**
 * Giá trị hiệu lực (ADR-0024): ngoại lệ của workspace nếu có; không thì cờ toàn app VÀ gói của workspace. Cờ con chỉ
 * bật khi cờ cha có hiệu lực (L3 18.1).
 */
async function computeFlags(db: DbOrTx, workspaceId: string, plan: PlanKey): Promise<Record<FlagKey, boolean>> {
  const [scopes, overrides] = await Promise.all([
    readFlagScopes(db),
    db
      .select({ key: featureFlags.flagKey, enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(eq(featureFlags.workspaceId, workspaceId)),
  ]);
  const ov = new Map(overrides.map((o) => [o.key, o.enabled]));
  const out = {} as Record<FlagKey, boolean>;
  for (const k of FLAG_KEYS) {
    const own = ov.has(k) ? ov.get(k)! : scopes.global[k] && scopes.plans[plan][k];
    const parent = FLAG_PARENT[k];
    out[k] = own && (parent ? out[parent] : true);
  }
  return out;
}

async function workspaceFlags(ctx: WorkspaceCtx): Promise<Record<FlagKey, boolean>> {
  return computeFlags(ctx.db, ctx.workspaceId, await currentPlanKey(ctx));
}

/** Giá trị hiệu lực không qua cache (dùng trong transaction đổi cờ). */
async function effectiveNow(db: DbOrTx, workspaceId: string, key: FlagKey): Promise<boolean> {
  return (await workspaceFlags({ db: db as Db, workspaceId }))[key];
}

/** Cờ có hiệu lực cho workspace không (toàn app × gói, hoặc ngoại lệ). */
export async function isEnabled(ctx: WorkspaceCtx, key: FlagKey): Promise<boolean> {
  const ck = cacheKey(ctx.workspaceId, key);
  const cached = cache ? await cache.get(ck) : undefined;
  if (cached !== undefined) return cached;
  const value = (await workspaceFlags(ctx))[key];
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
  return workspaceFlags(ctx);
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
      passed: await effectiveNow(db, workspaceId, parent),
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
  if (s?.role !== 'superadmin') throw forbidden('Chỉ superadmin được bật cờ');

  return db.transaction(async (tx) => {
    const [ws] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, input.workspaceId));
    if (!ws) throw new AppError('NOT_FOUND', 'Workspace không tồn tại');

    const checklist = await runChecklist(tx, input.workspaceId, input.key);
    const parentFailed = checklist.some((c) => c.id === 'parent_enabled' && !c.passed);
    // Không vượt được phụ thuộc giữa cờ: bật cờ con khi cờ cha tắt là trạng thái không hợp lệ.
    if (parentFailed) throw new AppError('CONFLICT', 'Cờ phụ thuộc chưa bật', { checklist });
    // ADR-0024: checklist chỉ để tham khảo (ghi nhật ký), không chặn — PM bỏ bước duyệt sau giai đoạn thử nghiệm.
    const allPassed = checklist.every((c) => c.passed);

    const old = (await readOverride(tx, input.workspaceId, input.key)) ?? false;
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
    // Trạng thái hiệu lực TRƯỚC khi đổi (tắt cờ cha làm cờ con mất hiệu lực ngay trong vòng lặp).
    const initial = await workspaceFlags({ db: tx as unknown as Db, workspaceId: input.workspaceId });
    for (const key of [input.key, ...dependentsOf(input.key)]) {
      // Tắt riêng (ngoại lệ false) — kể cả khi cờ đang bật theo toàn app × gói.
      const before = initial[key];
      const ov = await readOverride(tx, input.workspaceId, key);
      // Cờ chính: luôn ghi "tắt riêng" (chặn cả khi toàn app bật sau này). Cờ con: chỉ khi đang bật.
      if (key === input.key ? ov === false : !before) continue;
      const old = before;
      await tx
        .insert(featureFlags)
        .values({ workspaceId: input.workspaceId, flagKey: key, enabled: false, reason })
        .onConflictDoUpdate({
          target: [featureFlags.workspaceId, featureFlags.flagKey],
          set: { enabled: false, reason },
        });
      await tx.insert(flagChangeLog).values({
        workspaceId: input.workspaceId,
        flagKey: key,
        oldValue: old,
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

// ---------- ADR-0024: cờ toàn app, ma trận gói, ngoại lệ ----------

async function assertSuperadmin(db: DbOrTx, userId: string) {
  const s = await staffOf(db, userId);
  if (s?.role !== 'superadmin') throw forbidden('Chỉ superadmin được đổi cờ toàn app / theo gói');
}

const reasonOk = (r: string) => {
  const t = r.trim();
  if (t.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  return t;
};

/**
 * Bật / tắt cờ cho TOÀN APP (superadmin). Bật cờ con cần cờ cha toàn app đang bật; tắt cờ cha tắt luôn cờ con. Có
 * hiệu lực sau tối đa FLAG_CACHE_TTL_SECONDS (cache theo workspace). Hành động ghi đang chờ bị hủy khi worker chạy
 * (executor kiểm lại cờ).
 */
export async function setGlobalFlag(
  db: Db,
  input: { key: FlagKey; enabled: boolean; staffUserId: string; reason: string },
  clock: Clock = systemClock,
): Promise<FlagKey[]> {
  const reason = reasonOk(input.reason);
  await assertSuperadmin(db, input.staffUserId);
  const changed: FlagKey[] = [];
  await db.transaction(async (tx) => {
    const { global } = await readFlagScopes(tx);
    const parent = FLAG_PARENT[input.key];
    if (input.enabled && parent && !global[parent]) {
      throw new AppError('CONFLICT', 'Cờ phụ thuộc chưa bật toàn app', { parent });
    }
    const keys = input.enabled ? [input.key] : [input.key, ...dependentsOf(input.key)];
    const now = clock.now();
    for (const key of keys) {
      if (global[key] === input.enabled) continue;
      await tx
        .insert(flagGlobal)
        .values({ flagKey: key, enabled: input.enabled, changedBy: input.staffUserId, changedAt: now, reason })
        .onConflictDoUpdate({
          target: flagGlobal.flagKey,
          set: { enabled: input.enabled, changedBy: input.staffUserId, changedAt: now, reason },
        });
      await tx.insert(flagScopeLog).values({
        scope: 'global',
        flagKey: key,
        oldValue: global[key],
        newValue: input.enabled,
        changedBy: input.staffUserId,
        reason: key === input.key ? reason : `Tắt theo ${input.key}: ${reason}`,
        at: now,
      });
      changed.push(key);
    }
  });
  return changed;
}

/** Gói có / không có tính năng (superadmin). */
export async function setPlanFlag(
  db: Db,
  input: { plan: PlanKey; key: FlagKey; enabled: boolean; staffUserId: string; reason: string },
  clock: Clock = systemClock,
): Promise<void> {
  const reason = reasonOk(input.reason);
  await assertSuperadmin(db, input.staffUserId);
  if (!(PLAN_KEYS as readonly string[]).includes(input.plan))
    throw new AppError('VALIDATION_FAILED', 'Gói không hợp lệ');
  const { plans } = await readFlagScopes(db);
  const old = plans[input.plan][input.key];
  if (old === input.enabled) return;
  const now = clock.now();
  await db.transaction(async (tx) => {
    await tx
      .insert(planFlags)
      .values({
        planKey: input.plan,
        flagKey: input.key,
        enabled: input.enabled,
        changedBy: input.staffUserId,
        changedAt: now,
      })
      .onConflictDoUpdate({
        target: [planFlags.planKey, planFlags.flagKey],
        set: { enabled: input.enabled, changedBy: input.staffUserId, changedAt: now },
      });
    await tx.insert(flagScopeLog).values({
      scope: 'plan',
      planKey: input.plan,
      flagKey: input.key,
      oldValue: old,
      newValue: input.enabled,
      changedBy: input.staffUserId,
      reason,
      at: now,
    });
  });
}

/** Xóa ngoại lệ của workspace → về lại toàn app × gói (mọi staff, có nhật ký). */
export async function clearFlagOverride(
  db: Db,
  input: { workspaceId: string; key: FlagKey; staffUserId: string; reason: string },
  clock: Clock = systemClock,
): Promise<void> {
  const reason = reasonOk(input.reason);
  if (!(await staffOf(db, input.staffUserId))) throw forbidden('Chỉ đội AdxLens');
  const ov = await readOverride(db, input.workspaceId, input.key);
  if (ov === null) return;
  await db.transaction(async (tx) => {
    await tx
      .delete(featureFlags)
      .where(and(eq(featureFlags.workspaceId, input.workspaceId), eq(featureFlags.flagKey, input.key)));
    await tx.insert(flagChangeLog).values({
      workspaceId: input.workspaceId,
      flagKey: input.key,
      oldValue: ov,
      newValue: await effectiveNow(tx, input.workspaceId, input.key),
      changedBy: input.staffUserId,
      reason: `Xóa ngoại lệ: ${reason}`,
      checklistResult: [],
      at: clock.now(),
    });
  });
  await cache?.del(cacheKey(input.workspaceId, input.key));
}

/** Nhật ký đổi cờ toàn app / theo gói (mới nhất trước). */
export async function flagScopeHistory(db: DbOrTx, limit = 50) {
  return db.select().from(flagScopeLog).orderBy(desc(flagScopeLog.at), desc(flagScopeLog.id)).limit(limit);
}

/** Ngoại lệ của một workspace (để admin hiện "bật thêm / tắt riêng / theo gói"). */
export async function flagOverrides(db: DbOrTx, workspaceId: string): Promise<Partial<Record<FlagKey, boolean>>> {
  const rows = await db
    .select({ key: featureFlags.flagKey, enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.workspaceId, workspaceId));
  return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
}

/**
 * Cho trang admin (ADR-0024): với mỗi workspace — gói, giá trị hiệu lực và ngoại lệ của từng cờ. Đọc toàn app / ma trận
 * gói một lần.
 */
export async function adminFlagStates(
  db: Db,
  workspaceIds: string[],
): Promise<
  Map<string, { plan: PlanKey; effective: Record<FlagKey, boolean>; overrides: Partial<Record<FlagKey, boolean>> }>
> {
  const out = new Map<
    string,
    { plan: PlanKey; effective: Record<FlagKey, boolean>; overrides: Partial<Record<FlagKey, boolean>> }
  >();
  for (const workspaceId of workspaceIds) {
    const plan = await currentPlanKey({ db, workspaceId });
    out.set(workspaceId, {
      plan,
      effective: await computeFlags(db, workspaceId, plan),
      overrides: await flagOverrides(db, workspaceId),
    });
  }
  return out;
}
