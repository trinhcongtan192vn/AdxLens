import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
import { AppError, systemClock, type ActorCtx, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { ANNUAL_DISCOUNT } from './plans';
import { getPlans } from './service';
import type { BillingPeriod, PaidPlan } from './stripe';

const { paymentOrders, subscriptions } = schema;

/** Lớp gọi PayOS (028, cổng VN). Bản thật gọi REST; test dùng bản giả. Không log khóa hay body. */
export interface PayosApi {
  createPaymentLink(p: {
    orderCode: number;
    amount: bigint;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string; paymentLinkId: string }>;
  /** Trạng thái đơn trên PayOS (gọi bằng khóa của AdxLens qua TLS — tin cậy được). */
  getPaymentStatus(orderCode: number): Promise<{ status: string; amount: bigint }>;
}

export type PayosKeys = { clientId: string; apiKey: string; checksumKey: string };

/** Chuỗi ký PayOS: khóa xếp theo bảng chữ cái, `k=v` nối bằng `&`; null → rỗng; mảng/đối tượng → JSON. */
export function payosSignature(data: Record<string, unknown>, checksumKey: string): string {
  const s = Object.keys(data)
    .sort()
    .map((k) => {
      const v = data[k];
      const str = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k}=${str}`;
    })
    .join('&');
  return createHmac('sha256', checksumKey).update(s).digest('hex');
}

export function httpPayos(keys: PayosKeys, fetchImpl: typeof fetch = fetch): PayosApi {
  const BASE = 'https://api-merchant.payos.vn/v2/payment-requests';
  const headers = { 'x-client-id': keys.clientId, 'x-api-key': keys.apiKey, 'content-type': 'application/json' };
  const parse = async (res: Response) => {
    const json = (await res.json().catch(() => ({}))) as { code?: string; data?: Record<string, unknown> | null };
    if (!res.ok || json.code !== '00' || !json.data) {
      throw new AppError('EXTERNAL_SERVICE', 'PayOS từ chối yêu cầu', { payos_code: json.code ?? String(res.status) });
    }
    return json.data;
  };
  return {
    async createPaymentLink(p) {
      const signed = {
        amount: p.amount.toString(),
        cancelUrl: p.cancelUrl,
        description: p.description,
        orderCode: p.orderCode,
        returnUrl: p.returnUrl,
      };
      const res = await fetchImpl(BASE, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...signed,
          amount: Number(p.amount), // PayOS nhận số nguyên đồng; VND không có phần lẻ.
          signature: payosSignature(signed, keys.checksumKey),
        }),
      });
      const d = await parse(res);
      return { checkoutUrl: String(d.checkoutUrl), paymentLinkId: String(d.paymentLinkId) };
    },
    async getPaymentStatus(orderCode) {
      const d = await parse(await fetchImpl(`${BASE}/${orderCode}`, { headers }));
      return { status: String(d.status), amount: BigInt(String(d.amount)) };
    },
  };
}

/** Số tiền một kỳ (VND, BigInt). Năm = 12 tháng × (1 − giảm giá), làm tròn tới nghìn đồng như bảng giá. */
export function periodAmountVnd(monthlyPriceVnd: number, period: BillingPeriod): bigint {
  const m = BigInt(monthlyPriceVnd);
  if (period === 'monthly') return m;
  const pct = BigInt(Math.round(ANNUAL_DISCOUNT * 100));
  return (((m * 12n * (100n - pct)) / 100n + 500n) / 1000n) * 1000n;
}

function addPeriod(from: Date, period: BillingPeriod): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + (period === 'monthly' ? 1 : 12));
  return d;
}

/** Bắt đầu thanh toán một kỳ qua PayOS (QR / chuyển khoản). Chỉ owner. */
export async function startPayosCheckout(
  ctx: ActorCtx,
  input: { plan: PaidPlan; period: BillingPeriod },
  deps: { payos: PayosApi; appUrl: string },
): Promise<{ url: string; orderCode: number }> {
  assertCan(ctx.actor, 'billing.manage');
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  if (sub?.provider === 'stripe' && sub.status !== 'canceled') {
    throw new AppError('CONFLICT', 'Workspace đang thanh toán qua Stripe');
  }
  const plans = await getPlans(ctx.db);
  const amount = periodAmountVnd(plans[input.plan].monthlyPriceVnd, input.period);
  const [order] = await ctx.db
    .insert(paymentOrders)
    .values({
      workspaceId: ctx.workspaceId,
      provider: 'payos',
      planKey: input.plan,
      period: input.period,
      amountVnd: amount.toString(),
      createdBy: ctx.actor.userId,
    })
    .returning();
  const back = `${deps.appUrl}/settings/billing/checkout?provider=payos`;
  const link = await deps.payos.createPaymentLink({
    orderCode: order!.orderCode,
    amount,
    // PayOS giới hạn 25 ký tự cho nội dung chuyển khoản.
    description: `ADX ${order!.orderCode}`.slice(0, 25),
    returnUrl: back,
    cancelUrl: back,
  });
  await ctx.db
    .update(paymentOrders)
    .set({ checkoutUrl: link.checkoutUrl, paymentLinkId: link.paymentLinkId, updatedAt: new Date() })
    .where(and(eq(paymentOrders.workspaceId, ctx.workspaceId), eq(paymentOrders.id, order!.id)));
  return { url: link.checkoutUrl, orderCode: order!.orderCode };
}

/**
 * Ghi nhận đơn đã trả (webhook hoặc ST04 tra cứu): chỉ đơn `pending` của đúng workspace, số tiền phải khớp.
 * Gia hạn từ max(bây giờ, hết kỳ hiện tại) thêm 1 tháng / 1 năm. Gọi lặp lại không gia hạn hai lần.
 */
export async function applyPaidOrder(
  ctx: WorkspaceCtx,
  orderCode: number,
  paidAmount: bigint,
  clock: Clock = systemClock,
): Promise<'applied' | 'duplicate' | 'amount_mismatch' | 'not_found'> {
  const now = clock.now();
  const [order] = await ctx.db
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.workspaceId, ctx.workspaceId), eq(paymentOrders.orderCode, orderCode)));
  if (!order) return 'not_found';
  if (order.status === 'paid') return 'duplicate';
  if (BigInt(order.amountVnd) !== paidAmount) return 'amount_mismatch';
  const claimed = await ctx.db
    .update(paymentOrders)
    .set({ status: 'paid', paidAt: now, updatedAt: now })
    .where(
      and(
        eq(paymentOrders.workspaceId, ctx.workspaceId),
        eq(paymentOrders.id, order.id),
        eq(paymentOrders.status, order.status),
      ),
    )
    .returning({ id: paymentOrders.id });
  if (!claimed.length) return 'duplicate';
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  const running =
    sub?.provider === 'payos' && sub.status !== 'canceled' && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
  const period = order.period as BillingPeriod;
  const values = {
    planKey: order.planKey,
    status: 'active' as const,
    period,
    provider: 'payos' as const,
    providerCustomerId: null,
    providerSubscriptionId: null,
    currentPeriodEnd: addPeriod(running ? sub.currentPeriodEnd! : now, period),
    cancelAtPeriodEnd: false,
    pastDueSince: null,
    updatedAt: now,
  };
  await ctx.db
    .insert(subscriptions)
    .values({ workspaceId: ctx.workspaceId, ...values })
    .onConflictDoUpdate({ target: subscriptions.workspaceId, set: values });
  return 'applied';
}

/** ST04 khi PayOS chuyển về: tra trạng thái đơn trên PayOS để không phải chờ webhook. */
export async function confirmPayosOrder(
  ctx: ActorCtx,
  orderCode: number,
  deps: { payos: PayosApi; clock?: Clock },
): Promise<'paid' | 'pending' | 'canceled' | 'not_found'> {
  assertCan(ctx.actor, 'billing.manage');
  const [order] = await ctx.db
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.workspaceId, ctx.workspaceId), eq(paymentOrders.orderCode, orderCode)));
  if (!order) return 'not_found';
  if (order.status === 'paid') return 'paid';
  if (order.status !== 'pending') return 'canceled';
  const s = await deps.payos.getPaymentStatus(orderCode);
  if (s.status === 'PAID') {
    const r = await applyPaidOrder(ctx, orderCode, s.amount, deps.clock);
    return r === 'applied' || r === 'duplicate' ? 'paid' : 'pending';
  }
  if (s.status === 'CANCELLED' || s.status === 'EXPIRED') {
    await ctx.db
      .update(paymentOrders)
      .set({ status: s.status === 'CANCELLED' ? 'canceled' : 'expired', updatedAt: new Date() })
      .where(and(eq(paymentOrders.workspaceId, ctx.workspaceId), eq(paymentOrders.id, order.id)));
    return 'canceled';
  }
  return 'pending';
}

/** Webhook PayOS (dữ liệu, không phải lệnh): chỉ đọc các trường cần, kiểm bằng zod. */
export const payosWebhookSchema = z.object({
  code: z.string(),
  success: z.boolean().optional(),
  data: z
    .object({
      orderCode: z.number().int(),
      amount: z.number().int(),
      code: z.string(),
      reference: z.string().nullish(),
      paymentLinkId: z.string().nullish(),
    })
    .passthrough(),
  signature: z.string(),
});
export type PayosWebhook = z.infer<typeof payosWebhookSchema>;

/** Xác minh chữ ký webhook PayOS trên toàn bộ `data` (HMAC-SHA256, so sánh hằng thời gian). */
export function verifyPayosWebhook(body: PayosWebhook, checksumKey: string): boolean {
  const expected = Buffer.from(payosSignature(body.data, checksumKey), 'hex');
  const got = Buffer.from(body.signature, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}
