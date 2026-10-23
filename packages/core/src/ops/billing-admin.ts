import { desc, eq, isNotNull, or } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { getPlans, PLAN_KEYS, PLANS, setSubscription, type PlanKey } from '@adxlens/core/billing';
import { AppError, notFound } from '@adxlens/core/shared';
import { assertSuperadmin, recordAdminAction, type StaffActor } from './staff';

const { billingPlans, subscriptions, workspaces, paymentOrders, billingEvents } = schema;

/** Gia hạn ân hạn thủ công tối đa (ngày) mỗi lần — hỗ trợ khách, không thay chính sách 7 ngày (ADR-0001 A8). */
export const MAX_GRACE_EXTENSION_DAYS = 14;

const VND = /^\d{1,14}$/;
const USD = /^\d{1,8}(\.\d{1,2})?$/;

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  return r;
}

/** Gói hiện hành (DB hoặc mặc định trong code) cho trang admin; `fromDb` = đã có dòng cấu hình. */
export async function adminPlans(db: DbOrTx) {
  const [plans, rows] = await Promise.all([getPlans(db), db.select({ key: billingPlans.key }).from(billingPlans)]);
  const inDb = new Set(rows.map((r) => r.key));
  return PLAN_KEYS.map((k) => ({ ...plans[k], fromDb: inDb.has(k) }));
}

/**
 * Superadmin sửa giá / số tài khoản kèm / phí tài khoản vượt (tiền là chuỗi số nguyên đồng — numeric, không float).
 * Quyền của gói (entitlements) KHÔNG sửa ở đây: P2 cần Growth trở lên là quyết định PM (ADR-0001), giữ nguyên.
 */
export async function updatePlan(
  db: DbOrTx,
  actor: StaffActor,
  input: {
    key: PlanKey;
    monthlyPriceVnd: string;
    monthlyPriceUsd: string | null;
    includedAccounts: number;
    extraAccountVnd: string;
    reason: string;
  },
) {
  assertSuperadmin(actor, 'Chỉ superadmin sửa gói');
  const reason = requireReason(input.reason);
  if (!PLAN_KEYS.includes(input.key)) throw notFound('Gói');
  if (!VND.test(input.monthlyPriceVnd) || !VND.test(input.extraAccountVnd)) {
    throw new AppError('VALIDATION_FAILED', 'Giá VND phải là số nguyên đồng ≥ 0');
  }
  if (input.monthlyPriceUsd !== null && !USD.test(input.monthlyPriceUsd)) {
    throw new AppError('VALIDATION_FAILED', 'Giá USD tối đa 2 chữ số thập phân');
  }
  if (!Number.isInteger(input.includedAccounts) || input.includedAccounts < 1 || input.includedAccounts > 10_000) {
    throw new AppError('VALIDATION_FAILED', 'Số tài khoản kèm gói từ 1 đến 10.000');
  }
  const before = (await getPlans(db))[input.key];
  const [row] = await db.select().from(billingPlans).where(eq(billingPlans.key, input.key));
  const values = {
    monthlyPriceVnd: input.monthlyPriceVnd,
    monthlyPriceUsd: input.monthlyPriceUsd,
    includedAccounts: input.includedAccounts,
    extraAccountVnd: input.extraAccountVnd,
  };
  if (row) {
    await db.update(billingPlans).set(values).where(eq(billingPlans.key, input.key));
  } else {
    await db.insert(billingPlans).values({
      key: input.key,
      ...values,
      entitlements: [...PLANS[input.key].entitlements],
      sortOrder: PLAN_KEYS.indexOf(input.key),
    });
  }
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'billing.plan_update',
    targetType: 'plan',
    targetId: input.key,
    reason,
    detail: {
      from: {
        monthlyPriceVnd: String(before.monthlyPriceVnd),
        monthlyPriceUsd: before.monthlyPriceUsd === null ? null : String(before.monthlyPriceUsd),
        includedAccounts: before.includedAccounts,
        extraAccountVnd: String(before.extraAccountVnd),
      },
      to: values,
    },
  });
}

async function subscriptionOf(db: DbOrTx, workspaceId: string) {
  const [ws] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw notFound('Workspace');
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
  return sub ?? null;
}

/**
 * Superadmin đặt gói thủ công (tặng gói, design partner). Chỉ khi workspace không thanh toán qua Stripe / PayOS
 * (tránh lệch với nhà cung cấp thanh toán). Ghi nhật ký admin.
 */
export async function compPlan(
  db: DbOrTx,
  actor: StaffActor,
  input: { workspaceId: string; planKey: PlanKey; reason: string },
) {
  assertSuperadmin(actor, 'Chỉ superadmin đổi gói thủ công');
  const reason = requireReason(input.reason);
  if (!PLAN_KEYS.includes(input.planKey)) throw notFound('Gói');
  const sub = await subscriptionOf(db, input.workspaceId);
  if (sub && sub.provider !== 'none' && sub.status !== 'canceled') {
    throw new AppError('CONFLICT', 'Workspace đang thanh toán qua cổng thanh toán; đổi gói ở đó hoặc hủy trước');
  }
  await setSubscription({ db, workspaceId: input.workspaceId }, { planKey: input.planKey, provider: 'none' });
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'billing.comp_plan',
    targetType: 'subscription',
    targetId: input.workspaceId,
    workspaceId: input.workspaceId,
    reason,
    detail: { from: sub?.planKey ?? 'free', to: input.planKey },
  });
}

/**
 * Superadmin gia hạn ân hạn đang chạy (quá hạn thanh toán / vượt hạn mức) thêm 1–14 ngày bằng cách lùi mốc bắt đầu.
 * Không có ân hạn đang chạy → 409. Ghi nhật ký admin.
 */
export async function extendGrace(
  db: DbOrTx,
  actor: StaffActor,
  input: { workspaceId: string; days: number; reason: string },
) {
  assertSuperadmin(actor, 'Chỉ superadmin gia hạn ân hạn');
  const reason = requireReason(input.reason);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_GRACE_EXTENSION_DAYS) {
    throw new AppError('VALIDATION_FAILED', `Gia hạn 1–${MAX_GRACE_EXTENSION_DAYS} ngày`);
  }
  const sub = await subscriptionOf(db, input.workspaceId);
  const pastDue = sub?.status === 'past_due' ? sub.pastDueSince : null;
  const overLimit = sub?.overLimitSince ?? null;
  if (!sub || (!pastDue && !overLimit)) throw new AppError('CONFLICT', 'Workspace không có ân hạn đang chạy');
  const shift = (d: Date | null) => (d ? new Date(d.getTime() + input.days * 86_400_000) : null);
  await db
    .update(subscriptions)
    .set({
      ...(pastDue ? { pastDueSince: shift(pastDue) } : {}),
      ...(overLimit ? { overLimitSince: shift(overLimit) } : {}),
    })
    .where(eq(subscriptions.workspaceId, input.workspaceId));
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'billing.extend_grace',
    targetType: 'subscription',
    targetId: input.workspaceId,
    workspaceId: input.workspaceId,
    reason,
    detail: { days: input.days, pastDue: Boolean(pastDue), overLimit: Boolean(overLimit) },
  });
}

/**
 * Tổng quan thanh toán (staff): workspace quá hạn / vượt hạn mức, đơn PayOS và sự kiện webhook gần đây. XUYÊN
 * WORKSPACE có chủ đích: chỉ route staff gọi. Không trả link thanh toán hay mã khách của nhà cung cấp.
 */
export async function billingOverview(db: DbOrTx) {
  const [attention, orders, events] = await Promise.all([
    db
      .select({
        workspaceId: subscriptions.workspaceId,
        workspaceName: workspaces.name,
        planKey: subscriptions.planKey,
        status: subscriptions.status,
        provider: subscriptions.provider,
        pastDueSince: subscriptions.pastDueSince,
        overLimitSince: subscriptions.overLimitSince,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
      .where(or(eq(subscriptions.status, 'past_due'), isNotNull(subscriptions.overLimitSince)))
      .limit(200),
    db
      .select({
        id: paymentOrders.id,
        workspaceId: paymentOrders.workspaceId,
        workspaceName: workspaces.name,
        orderCode: paymentOrders.orderCode,
        planKey: paymentOrders.planKey,
        period: paymentOrders.period,
        amountVnd: paymentOrders.amountVnd,
        status: paymentOrders.status,
        paidAt: paymentOrders.paidAt,
        createdAt: paymentOrders.createdAt,
      })
      .from(paymentOrders)
      .innerJoin(workspaces, eq(workspaces.id, paymentOrders.workspaceId))
      .orderBy(desc(paymentOrders.createdAt))
      .limit(50),
    db
      .select({
        id: billingEvents.id,
        provider: billingEvents.provider,
        type: billingEvents.type,
        workspaceId: billingEvents.workspaceId,
        workspaceName: workspaces.name,
        createdAt: billingEvents.createdAt,
      })
      .from(billingEvents)
      .leftJoin(workspaces, eq(workspaces.id, billingEvents.workspaceId))
      .orderBy(desc(billingEvents.createdAt))
      .limit(50),
  ]);
  return { attention, orders, events };
}
