import { eq, or } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import {
  applyPaidOrder,
  applyStripeEvent,
  HANDLED_STRIPE_EVENTS,
  stripeEventRefs,
  type PayosWebhook,
  type StripeEvent,
} from '@adxlens/core/billing';
import type { Clock } from '@adxlens/core/shared';

const { billingEvents, paymentOrders, subscriptions, workspaces } = schema;

export type WebhookResult = { status: 'applied' | 'ignored' | 'duplicate' | 'unknown_workspace'; workspaceId?: string };

/**
 * Webhook Stripe (027) — truy vấn XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1): sự kiện đến từ Stripe
 * không mang phiên người dùng, phải tìm workspace qua metadata đã ký hoặc mã subscription/customer
 * Stripe. Chữ ký đã được route xác minh. Mỗi sự kiện chỉ xử lý một lần (`billing_events` unique), rồi áp
 * trong ngữ cảnh đúng một workspace.
 */
export async function handleStripeWebhook(
  db: Db,
  event: StripeEvent,
  deps: { enqueue?: Enqueue; clock?: Clock } = {},
): Promise<WebhookResult> {
  if (!(HANDLED_STRIPE_EVENTS as readonly string[]).includes(event.type)) return { status: 'ignored' };
  const refs = stripeEventRefs(event);
  let workspaceId: string | undefined;
  if (refs.subscriptionId || refs.customerId) {
    const conds = [
      refs.subscriptionId ? eq(subscriptions.providerSubscriptionId, refs.subscriptionId) : undefined,
      refs.customerId ? eq(subscriptions.providerCustomerId, refs.customerId) : undefined,
    ].filter((c) => c !== undefined);
    const [row] = await db
      .select({ workspaceId: subscriptions.workspaceId })
      .from(subscriptions)
      .where(conds.length === 1 ? conds[0] : or(...conds))
      .limit(1);
    workspaceId = row?.workspaceId;
  }
  // Metadata do chính AdxLens đặt lúc tạo checkout; chỉ dùng khi chưa có subscription Stripe nào khớp.
  if (!workspaceId && refs.workspaceId) {
    const [ws] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, refs.workspaceId));
    workspaceId = ws?.id;
  }
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(billingEvents)
      .values({ provider: 'stripe', eventId: event.id, type: event.type, workspaceId: workspaceId ?? null })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id });
    if (!inserted.length) return { status: 'duplicate' as const, workspaceId };
    if (!workspaceId) return { status: 'unknown_workspace' as const };
    const r = await applyStripeEvent({ db: tx, workspaceId }, event, deps);
    return { status: r, workspaceId };
  });
}

export type PayosWebhookResult = {
  status: 'applied' | 'duplicate' | 'ignored' | 'unknown_order' | 'amount_mismatch';
  workspaceId?: string;
};

/**
 * Webhook PayOS (028) — XUYÊN WORKSPACE có chủ đích: tìm đơn theo `orderCode` (số do AdxLens cấp, unique
 * toàn hệ thống) để biết workspace, rồi ghi nhận trong ngữ cảnh workspace đó. Chữ ký đã được route xác
 * minh. Số tiền phải khớp đơn; gọi lặp không gia hạn hai lần.
 */
export async function handlePayosWebhook(
  db: Db,
  body: PayosWebhook,
  deps: { clock?: Clock } = {},
): Promise<PayosWebhookResult> {
  if (body.code !== '00' || body.data.code !== '00') return { status: 'ignored' };
  const [order] = await db
    .select({ workspaceId: paymentOrders.workspaceId })
    .from(paymentOrders)
    .where(eq(paymentOrders.orderCode, body.data.orderCode));
  // PayOS gửi một webhook thử (đơn không tồn tại) khi xác nhận URL — trả 200.
  if (!order) return { status: 'unknown_order' };
  const workspaceId = order.workspaceId;
  return db.transaction(async (tx) => {
    await tx
      .insert(billingEvents)
      .values({
        provider: 'payos',
        eventId: `${body.data.orderCode}:${body.data.reference ?? body.data.paymentLinkId ?? 'paid'}`,
        type: 'payment.paid',
        workspaceId,
      })
      .onConflictDoNothing();
    const r = await applyPaidOrder({ db: tx, workspaceId }, body.data.orderCode, BigInt(body.data.amount), deps.clock);
    return { status: r === 'not_found' ? 'unknown_order' : r, workspaceId };
  });
}
