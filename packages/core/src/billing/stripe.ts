import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { notify } from '@adxlens/core/notification';
import { AppError, systemClock, toScaled, type ActorCtx, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { ANNUAL_DISCOUNT, PLAN_KEYS, type PlanKey } from './plans';
import { getPlans } from './service';

const { subscriptions } = schema;

export const PAID_PLANS = ['starter', 'growth', 'scale'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type BillingPeriod = 'monthly' | 'annual';

/** Lớp gọi Stripe (027). Bản thật gọi REST bằng fetch; test dùng bản giả. Không log secret hay body. */
export interface StripeApi {
  createCheckoutSession(p: {
    customer: string | null;
    customerEmail: string | null;
    currency: 'usd' | 'vnd';
    unitAmount: bigint;
    interval: 'month' | 'year';
    productName: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  createPortalSession(p: { customer: string; returnUrl: string }): Promise<{ url: string }>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>;
}

/** Stripe REST bằng fetch (không thêm thư viện). Lỗi trả về chỉ mang mã, không mang body. */
export function httpStripe(secretKey: string, fetchImpl: typeof fetch = fetch): StripeApi {
  async function call(path: string, form: URLSearchParams): Promise<Record<string, unknown>> {
    const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const code = (json.error as { code?: string } | undefined)?.code ?? String(res.status);
      throw new AppError('EXTERNAL_SERVICE', 'Stripe từ chối yêu cầu', { stripe_code: code });
    }
    return json;
  }
  return {
    async createCheckoutSession(p) {
      const f = new URLSearchParams({
        mode: 'subscription',
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': p.currency,
        'line_items[0][price_data][unit_amount]': p.unitAmount.toString(),
        'line_items[0][price_data][recurring][interval]': p.interval,
        'line_items[0][price_data][product_data][name]': p.productName,
      });
      if (p.customer) f.set('customer', p.customer);
      else if (p.customerEmail) f.set('customer_email', p.customerEmail);
      for (const [k, v] of Object.entries(p.metadata)) {
        f.set(`metadata[${k}]`, v);
        f.set(`subscription_data[metadata][${k}]`, v);
      }
      const r = await call('checkout/sessions', f);
      return { id: String(r.id), url: String(r.url) };
    },
    async createPortalSession(p) {
      const r = await call(
        'billing_portal/sessions',
        new URLSearchParams({ customer: p.customer, return_url: p.returnUrl }),
      );
      return { url: String(r.url) };
    },
    async setCancelAtPeriodEnd(id, cancel) {
      await call(
        `subscriptions/${encodeURIComponent(id)}`,
        new URLSearchParams({ cancel_at_period_end: String(cancel) }),
      );
    },
  };
}

/** Số tiền một kỳ theo đơn vị nhỏ nhất của Stripe (USD: cent; VND: đồng). Năm = 12 tháng × (1 − giảm giá). */
export function stripeAmount(
  plan: { monthlyPriceVnd: number; monthlyPriceUsd: number | null },
  period: BillingPeriod,
): { currency: 'usd' | 'vnd'; unitAmount: bigint } {
  const discountPct = BigInt(Math.round(ANNUAL_DISCOUNT * 100));
  if (plan.monthlyPriceUsd !== null) {
    const cents = toScaled(String(plan.monthlyPriceUsd), 2);
    const amount = period === 'monthly' ? cents : (cents * 12n * (100n - discountPct) + 50n) / 100n;
    return { currency: 'usd', unitAmount: amount };
  }
  const vnd = BigInt(plan.monthlyPriceVnd);
  // Năm: làm tròn tới nghìn đồng (như bảng giá).
  const amount = period === 'monthly' ? vnd : (((vnd * 12n * (100n - discountPct)) / 100n + 500n) / 1000n) * 1000n;
  return { currency: 'vnd', unitAmount: amount };
}

/** Bắt đầu thanh toán gói (ST03 → Stripe Checkout). Chỉ owner (`billing.manage`). */
export async function startStripeCheckout(
  ctx: ActorCtx,
  input: { plan: PaidPlan; period: BillingPeriod; email: string | null },
  deps: { stripe: StripeApi; appUrl: string },
): Promise<{ url: string }> {
  assertCan(ctx.actor, 'billing.manage');
  const plans = await getPlans(ctx.db);
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  if (sub?.provider === 'payos' && sub.status !== 'canceled' && sub.planKey !== 'free') {
    throw new AppError('CONFLICT', 'Workspace đang thanh toán qua cổng khác');
  }
  const { currency, unitAmount } = stripeAmount(plans[input.plan], input.period);
  const s = await deps.stripe.createCheckoutSession({
    customer: sub?.provider === 'stripe' ? (sub.providerCustomerId ?? null) : null,
    customerEmail: input.email,
    currency,
    unitAmount,
    interval: input.period === 'monthly' ? 'month' : 'year',
    productName: `AdxLens ${input.plan[0]!.toUpperCase()}${input.plan.slice(1)}`,
    successUrl: `${deps.appUrl}/settings/billing/checkout?status=success`,
    cancelUrl: `${deps.appUrl}/settings/billing/checkout?status=cancel`,
    metadata: { workspace_id: ctx.workspaceId, plan: input.plan, period: input.period },
  });
  return { url: s.url };
}

/** Cổng tự phục vụ của Stripe (đổi thẻ, xem hóa đơn). */
export async function openStripePortal(
  ctx: ActorCtx,
  deps: { stripe: StripeApi; appUrl: string },
): Promise<{ url: string }> {
  assertCan(ctx.actor, 'billing.manage');
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  if (sub?.provider !== 'stripe' || !sub.providerCustomerId)
    throw new AppError('CONFLICT', 'Chưa có thanh toán Stripe');
  return deps.stripe.createPortalSession({
    customer: sub.providerCustomerId,
    returnUrl: `${deps.appUrl}/settings/billing`,
  });
}

/** Hủy gói cuối kỳ (hoặc bỏ hủy). Quyền vẫn giữ tới hết kỳ; webhook `deleted` mới đưa về Free. */
export async function setStripeCancel(ctx: ActorCtx, cancel: boolean, deps: { stripe: StripeApi }): Promise<void> {
  assertCan(ctx.actor, 'billing.manage');
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  if (sub?.provider !== 'stripe' || !sub.providerSubscriptionId || sub.status === 'canceled') {
    throw new AppError('CONFLICT', 'Không có gói Stripe đang chạy');
  }
  await deps.stripe.setCancelAtPeriodEnd(sub.providerSubscriptionId, cancel);
  await ctx.db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: cancel })
    .where(eq(subscriptions.workspaceId, ctx.workspaceId));
}

const SIGNATURE_TOLERANCE_S = 300;

/**
 * Xác minh header `Stripe-Signature` (`t=…,v1=…`): HMAC-SHA256 của `${t}.${payload}` bằng webhook
 * secret, so sánh hằng thời gian, lệch thời gian tối đa 5 phút (chống phát lại).
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Ký payload như Stripe (test và `pnpm` thử webhook cục bộ). */
export function signStripePayload(payload: string, secret: string, nowMs = Date.now()): string {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
}

const metadataSchema = z
  .object({ workspace_id: z.string().uuid().optional(), plan: z.string().optional(), period: z.string().optional() })
  .passthrough()
  .default({});

const subscriptionObject = z
  .object({
    id: z.string(),
    customer: z.string(),
    status: z.string(),
    cancel_at_period_end: z.boolean().default(false),
    current_period_end: z.number().nullable().optional(),
    items: z.object({ data: z.array(z.object({ current_period_end: z.number().optional() })) }).optional(),
    metadata: metadataSchema,
  })
  .passthrough();

const checkoutObject = z
  .object({
    id: z.string(),
    customer: z.string().nullable(),
    subscription: z.string().nullable(),
    metadata: metadataSchema,
  })
  .passthrough();

const invoiceObject = z
  .object({
    id: z.string(),
    customer: z.string().nullable(),
    subscription: z.string().nullable().optional(),
    parent: z
      .object({
        subscription_details: z.object({ subscription: z.string().nullable().optional() }).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

/** Sự kiện Stripe (dữ liệu, không phải lệnh — chỉ đọc các trường cần thiết, kiểm bằng zod). */
export const stripeEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});
export type StripeEvent = z.infer<typeof stripeEventSchema>;

export const HANDLED_STRIPE_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.paid',
] as const;

/** Khóa để tìm workspace của sự kiện: metadata trước, rồi mã subscription / customer của Stripe. */
export function stripeEventRefs(e: StripeEvent): {
  workspaceId?: string;
  subscriptionId?: string;
  customerId?: string;
} {
  const o = e.data.object;
  if (e.type === 'checkout.session.completed') {
    const c = checkoutObject.parse(o);
    return {
      workspaceId: c.metadata.workspace_id,
      subscriptionId: c.subscription ?? undefined,
      customerId: c.customer ?? undefined,
    };
  }
  if (e.type.startsWith('customer.subscription.')) {
    const s = subscriptionObject.parse(o);
    return { workspaceId: s.metadata.workspace_id, subscriptionId: s.id, customerId: s.customer };
  }
  if (e.type.startsWith('invoice.')) {
    const i = invoiceObject.parse(o);
    const sub = i.subscription ?? i.parent?.subscription_details?.subscription ?? undefined;
    return { subscriptionId: sub ?? undefined, customerId: i.customer ?? undefined };
  }
  return {};
}

function planFrom(meta: { plan?: string }, fallback: string | undefined): PlanKey | null {
  const p = meta.plan ?? fallback;
  return p && (PLAN_KEYS as readonly string[]).includes(p) ? (p as PlanKey) : null;
}

const STATUS_MAP: Record<string, 'active' | 'past_due' | 'canceled'> = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete_expired: 'canceled',
};

/**
 * Áp một sự kiện Stripe lên subscription của workspace (đã xác định ở `core/ops`, đã chống trùng).
 * past_due mở ân hạn 7 ngày (giữ mốc cũ nếu đã có); thanh toán lại → active; deleted → canceled (Free).
 */
export async function applyStripeEvent(
  ctx: WorkspaceCtx,
  e: StripeEvent,
  deps: { enqueue?: Enqueue; clock?: Clock } = {},
): Promise<'applied' | 'ignored'> {
  const now = (deps.clock ?? systemClock).now();
  const [sub] = await ctx.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ctx.workspaceId));
  const write = async (set: Partial<typeof subscriptions.$inferInsert>) => {
    if (sub) await ctx.db.update(subscriptions).set(set).where(eq(subscriptions.workspaceId, ctx.workspaceId));
    else await ctx.db.insert(subscriptions).values({ workspaceId: ctx.workspaceId, planKey: 'free', ...set });
  };
  const toPastDue = async () => {
    await write({
      status: 'past_due',
      pastDueSince: sub?.status === 'past_due' && sub.pastDueSince ? sub.pastDueSince : now,
    });
    if (sub?.status !== 'past_due') {
      await notify(
        ctx,
        {
          kind: 'billing_failed',
          recipients: { roles: ['owner'] },
          link: '/settings/billing',
          dedupeKey: `billing_failed:${e.id}`,
        },
        { enqueue: deps.enqueue },
      );
    }
  };

  switch (e.type) {
    case 'checkout.session.completed': {
      const c = checkoutObject.parse(e.data.object);
      const plan = planFrom(c.metadata, undefined);
      if (!plan || !c.subscription || !c.customer) return 'ignored';
      await write({
        planKey: plan,
        status: 'active',
        period: c.metadata.period === 'annual' ? 'annual' : 'monthly',
        provider: 'stripe',
        providerCustomerId: c.customer,
        providerSubscriptionId: c.subscription,
        cancelAtPeriodEnd: false,
        pastDueSince: null,
      });
      return 'applied';
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const s = subscriptionObject.parse(e.data.object);
      // Sự kiện của subscription cũ (đã thay bằng cái mới) thì bỏ qua.
      if (sub?.providerSubscriptionId && sub.providerSubscriptionId !== s.id) return 'ignored';
      const end = s.current_period_end ?? s.items?.data[0]?.current_period_end ?? null;
      const status =
        e.type === 'customer.subscription.deleted' ? 'canceled' : (STATUS_MAP[s.status] ?? sub?.status ?? 'active');
      const plan = planFrom(s.metadata, sub?.planKey);
      if (status === 'past_due') await toPastDue();
      await write({
        ...(plan ? { planKey: plan } : {}),
        status,
        provider: 'stripe',
        providerCustomerId: s.customer,
        providerSubscriptionId: s.id,
        cancelAtPeriodEnd: s.cancel_at_period_end,
        currentPeriodEnd: end ? new Date(end * 1000) : null,
        ...(status === 'past_due' ? {} : { pastDueSince: null }),
      });
      return 'applied';
    }
    case 'invoice.payment_failed': {
      if (!sub || sub.provider !== 'stripe') return 'ignored';
      await toPastDue();
      return 'applied';
    }
    case 'invoice.paid': {
      if (!sub || sub.provider !== 'stripe' || sub.status === 'canceled') return 'ignored';
      await write({ status: 'active', pastDueSince: null });
      return 'applied';
    }
    default:
      return 'ignored';
  }
}
