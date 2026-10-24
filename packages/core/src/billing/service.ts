import { and, eq, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { AppError, systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { isStaff } from '@adxlens/core/tenancy';
import {
  DEFAULT_PLAN,
  EXTRA_ACCOUNT_MONTHLY_VND,
  GRACE_PERIOD_DAYS,
  MAX_OWNED_FREE_WORKSPACES,
  PLAN_KEYS,
  PLANS,
  type Entitlement,
  type Plan,
  type PlanKey,
} from './plans';

const { billingPlans, subscriptions, adAccounts, metaConnections, workspaces, memberships } = schema;

export type PlanConfig = Plan & { monthlyPriceUsd: number | null; extraAccountVnd: number };

/** Gói từ bảng cấu hình (PM chỉnh), thiếu thì dùng mặc định trong code. Giá là số nguyên đồng. */
export async function getPlans(db: DbOrTx): Promise<Record<PlanKey, PlanConfig>> {
  const rows = await db.select().from(billingPlans).where(eq(billingPlans.active, true));
  const out = {} as Record<PlanKey, PlanConfig>;
  for (const key of PLAN_KEYS) {
    const r = rows.find((x) => x.key === key);
    const def = PLANS[key];
    out[key] = r
      ? {
          key,
          monthlyPriceVnd: Number(r.monthlyPriceVnd),
          monthlyPriceUsd: r.monthlyPriceUsd === null ? null : Number(r.monthlyPriceUsd),
          includedAccounts: r.includedAccounts,
          extraAccountVnd: Number(r.extraAccountVnd),
          entitlements: r.entitlements as Entitlement[],
        }
      : { ...def, monthlyPriceUsd: null, extraAccountVnd: EXTRA_ACCOUNT_MONTHLY_VND };
  }
  return out;
}

/** Tài khoản đang hoạt động (PRD 13.3): có chi tiêu trong 30 ngày; không tính tài khoản mẫu và kết nối đã ngắt. */
export async function activeAccountCount(ctx: WorkspaceCtx): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(
      and(
        eq(adAccounts.workspaceId, ctx.workspaceId),
        eq(adAccounts.active30d, true),
        eq(metaConnections.isDemo, false),
        ne(metaConnections.status, 'revoked'),
      ),
    );
  return r?.n ?? 0;
}

export type BillingStatus = {
  /** Gói đã đăng ký (trên subscription). */
  subscribedPlan: PlanKey;
  /** Cấu hình của gói đang hưởng quyền (hạn mức tài khoản, quyền). */
  plan: PlanConfig;
  /** Gói đang hưởng quyền (hết ân hạn past_due → Free). */
  effectivePlan: PlanKey;
  status: 'active' | 'past_due' | 'canceled';
  period: 'monthly' | 'annual';
  provider: 'none' | 'stripe' | 'payos';
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  activeAccounts: number;
  overLimit: boolean;
  /** Ân hạn đang chạy (vượt hạn mức hoặc thanh toán thất bại), hết hạn lúc nào. */
  graceUntil: Date | null;
  graceExpired: boolean;
};

function graceEnd(since: Date | null): Date | null {
  return since ? new Date(since.getTime() + GRACE_PERIOD_DAYS * 86_400_000) : null;
}

/** Trạng thái thanh toán + hạn mức của workspace (ST03, X04, quyền theo gói). */
export async function billingStatus(ctx: WorkspaceCtx, clock: Clock = systemClock): Promise<BillingStatus> {
  const now = clock.now();
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  const plans = await getPlans(ctx.db);
  const planKey = (
    sub && (PLAN_KEYS as readonly string[]).includes(sub.planKey) ? sub.planKey : DEFAULT_PLAN
  ) as PlanKey;
  const pastDueEnd = sub?.status === 'past_due' ? graceEnd(sub.pastDueSince ?? now) : null;
  // PRD 13.3: hết ân hạn thanh toán (hoặc đã hủy) → quyền về Free.
  const effectivePlan: PlanKey = (pastDueEnd && pastDueEnd <= now) || sub?.status === 'canceled' ? 'free' : planKey;
  const plan = plans[effectivePlan];
  const active = await activeAccountCount(ctx);
  const overLimit = active > plan.includedAccounts;
  const overEnd = overLimit ? graceEnd(sub?.overLimitSince ?? now) : null;
  const ends = [pastDueEnd, overEnd].filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const graceUntil = ends[0] ?? null;
  return {
    subscribedPlan: planKey,
    plan,
    effectivePlan,
    status: sub?.status ?? 'active',
    period: sub?.period ?? 'monthly',
    provider: sub?.provider ?? 'none',
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    activeAccounts: active,
    overLimit,
    graceUntil,
    graceExpired: graceUntil !== null && graceUntil <= now,
  };
}

/** Gói hiện tại (thay stub cũ — tech-debt 026). */
export async function currentPlanKey(ctx: WorkspaceCtx, clock: Clock = systemClock): Promise<PlanKey> {
  return (await billingStatus(ctx, clock)).effectivePlan;
}

/** Quyền theo gói (kết hợp với cờ ở route/job: P2 cần cả cờ và gói Growth+, ADR-0001 A6). */
export async function hasPlanEntitlement(
  ctx: WorkspaceCtx,
  e: Entitlement,
  clock: Clock = systemClock,
): Promise<boolean> {
  return (await billingStatus(ctx, clock)).plan.entitlements.includes(e);
}

/** Nhãn "Powered by" (P0-15): ẩn khi gói có `remove_badge` hoặc workspace được gỡ thủ công. */
export async function showPoweredBy(ctx: WorkspaceCtx, clock: Clock = systemClock): Promise<boolean> {
  const [ws] = await ctx.db
    .select({ badgeRemoved: workspaces.badgeRemoved })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId));
  if (ws?.badgeRemoved) return false;
  return !(await hasPlanEntitlement(ctx, 'remove_badge', clock));
}

/**
 * Cập nhật mốc vượt hạn mức (job hằng ngày): bắt đầu vượt → ghi `over_limit_since` (mở ân hạn 7 ngày);
 * hết vượt → xóa mốc. Tạo dòng subscription Free khi cần ghi mốc.
 */
export async function refreshOverLimit(ctx: WorkspaceCtx, clock: Clock = systemClock): Promise<'over' | 'ok'> {
  const s = await billingStatus(ctx, clock);
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  if (s.overLimit && !sub?.overLimitSince) {
    await ctx.db
      .insert(subscriptions)
      .values({ workspaceId: ctx.workspaceId, planKey: s.subscribedPlan, overLimitSince: clock.now() })
      .onConflictDoUpdate({ target: subscriptions.workspaceId, set: { overLimitSince: clock.now() } });
  } else if (!s.overLimit && sub?.overLimitSince) {
    await ctx.db
      .update(subscriptions)
      .set({ overLimitSince: null })
      .where(eq(subscriptions.workspaceId, ctx.workspaceId));
  }
  return s.overLimit ? 'over' : 'ok';
}

/**
 * Tài khoản được đồng bộ hằng ngày: hết ân hạn vượt hạn mức → chỉ giữ `includedAccounts` tài khoản nhập
 * sớm nhất (dữ liệu cũ giữ nguyên, PRD 13.3). Còn trong ân hạn → mọi tài khoản.
 */
export async function syncableAccountIds(ctx: WorkspaceCtx, clock: Clock = systemClock): Promise<Set<string> | null> {
  const s = await billingStatus(ctx, clock);
  if (!s.overLimit || !s.graceExpired) return null; // null = không giới hạn
  const rows = await ctx.db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(
      and(
        eq(adAccounts.workspaceId, ctx.workspaceId),
        eq(adAccounts.active30d, true),
        eq(metaConnections.isDemo, false),
      ),
    )
    .orderBy(adAccounts.createdAt)
    .limit(s.plan.includedAccounts);
  return new Set(rows.map((r) => r.id));
}

/** Đổi gói (027/028 gọi sau thanh toán; test dùng). */
export async function setSubscription(
  ctx: WorkspaceCtx,
  input: {
    planKey: PlanKey;
    status?: 'active' | 'past_due' | 'canceled';
    period?: 'monthly' | 'annual';
    provider?: 'none' | 'stripe' | 'payos';
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    pastDueSince?: Date | null;
  },
) {
  const values = {
    planKey: input.planKey,
    status: input.status ?? 'active',
    period: input.period ?? 'monthly',
    provider: input.provider ?? 'none',
    providerCustomerId: input.providerCustomerId ?? null,
    providerSubscriptionId: input.providerSubscriptionId ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    pastDueSince: input.status === 'past_due' ? (input.pastDueSince ?? new Date()) : null,
  };
  await ctx.db
    .insert(subscriptions)
    .values({ workspaceId: ctx.workspaceId, ...values })
    .onConflictDoUpdate({ target: subscriptions.workspaceId, set: values });
}

/**
 * Số workspace user đang sở hữu ở gói Free (chưa có subscription, gói `free`, hoặc đã hủy).
 * Truy vấn theo user trên các workspace mà chính user là owner (như `listWorkspacesForUser`), không đọc dữ liệu
 * nghiệp vụ của workspace nào.
 */
export async function ownedFreeWorkspaceCount(db: DbOrTx, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, 'owner'),
        sql`(${subscriptions.workspaceId} is null or ${subscriptions.planKey} = 'free' or ${subscriptions.status} = 'canceled')`,
      ),
    );
  return r?.n ?? 0;
}

/** Trước khi tạo workspace (A07): workspace mới ở gói Free → chặn khi user đã sở hữu đủ số workspace Free. */
export async function assertCanCreateWorkspace(db: DbOrTx, userId: string): Promise<void> {
  if (await isStaff(db, userId)) return;
  if ((await ownedFreeWorkspaceCount(db, userId)) >= MAX_OWNED_FREE_WORKSPACES) {
    throw new AppError('PLAN_REQUIRED', 'Bạn đã có workspace gói Free. Nâng cấp gói workspace đó trước khi tạo thêm.', {
      reason: 'free_workspace_limit',
    });
  }
}
