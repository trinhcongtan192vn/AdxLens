import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { handleStripeWebhook } from '@adxlens/core/ops';
import { listNotifications } from '@adxlens/core/notification';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  billingStatus,
  currentPlanKey,
  getBillingProfile,
  openStripePortal,
  saveBillingProfile,
  setStripeCancel,
  signStripePayload,
  startStripeCheckout,
  stripeAmount,
  verifyStripeSignature,
  type StripeApi,
  type StripeEvent,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const NOW = new Date('2026-10-23T03:00:00Z');
const clock = { now: () => NOW };
const APP = 'http://localhost:3000';

class FakeStripe implements StripeApi {
  checkouts: Parameters<StripeApi['createCheckoutSession']>[0][] = [];
  portals: string[] = [];
  cancels: [string, boolean][] = [];
  async createCheckoutSession(p: Parameters<StripeApi['createCheckoutSession']>[0]) {
    this.checkouts.push(p);
    return { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' };
  }
  async createPortalSession(p: { customer: string; returnUrl: string }) {
    this.portals.push(p.customer);
    return { url: 'https://billing.stripe.test/p' };
  }
  async setCancelAtPeriodEnd(id: string, cancel: boolean) {
    this.cancels.push([id, cancel]);
  }
}

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  return { ctx, workspaceId: workspace.id, owner };
}

let seq = 0;
const ev = (type: string, object: Record<string, unknown>): StripeEvent => ({
  id: `evt_${++seq}`,
  type,
  data: { object },
});
const completed = (workspaceId: string, plan = 'growth', sub = 'sub_A', cus = 'cus_A') =>
  ev('checkout.session.completed', {
    id: 'cs_1',
    customer: cus,
    subscription: sub,
    metadata: { workspace_id: workspaceId, plan, period: 'monthly' },
  });

describe('chữ ký webhook Stripe', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1"}';
  it('đúng secret, trong 5 phút → hợp lệ', () => {
    const h = signStripePayload(body, secret, NOW.getTime());
    expect(verifyStripeSignature(body, h, secret, NOW.getTime() + 60_000)).toBe(true);
  });
  it('sai secret, body bị sửa, quá 5 phút, header hỏng → từ chối', () => {
    const h = signStripePayload(body, secret, NOW.getTime());
    expect(verifyStripeSignature(body, h, 'whsec_other', NOW.getTime())).toBe(false);
    expect(verifyStripeSignature('{"id":"evt_2"}', h, secret, NOW.getTime())).toBe(false);
    expect(verifyStripeSignature(body, h, secret, NOW.getTime() + 301_000)).toBe(false);
    expect(verifyStripeSignature(body, 'garbage', secret, NOW.getTime())).toBe(false);
    expect(verifyStripeSignature(body, null, secret, NOW.getTime())).toBe(false);
  });
});

describe('số tiền gửi Stripe (không dùng float)', () => {
  it('USD theo cent; năm = 12 × 80%', () => {
    expect(stripeAmount({ monthlyPriceVnd: 1_490_000, monthlyPriceUsd: 59 }, 'monthly')).toEqual({
      currency: 'usd',
      unitAmount: 5900n,
    });
    expect(stripeAmount({ monthlyPriceVnd: 1_490_000, monthlyPriceUsd: 59 }, 'annual').unitAmount).toBe(56640n);
  });
  it('không có giá USD → VND; năm làm tròn tới nghìn đồng', () => {
    expect(stripeAmount({ monthlyPriceVnd: 590_000, monthlyPriceUsd: null }, 'annual')).toEqual({
      currency: 'vnd',
      unitAmount: 5_664_000n,
    });
  });
});

describe('checkout / cổng / hủy gói', () => {
  it('checkout mang metadata workspace + gói, giá từ DB, URL kết quả ST04', async () => {
    const { ctx, workspaceId } = await setup();
    await db.insert(schema.billingPlans).values({
      key: 'growth',
      monthlyPriceVnd: '1490000',
      monthlyPriceUsd: '64.00',
      includedAccounts: 15,
      entitlements: ['reports'],
    });
    const stripe = new FakeStripe();
    const r = await startStripeCheckout(
      ctx,
      { plan: 'growth', period: 'monthly', email: 'o@a.vn' },
      { stripe, appUrl: APP },
    );
    expect(r.url).toBe('https://checkout.stripe.test/cs_1');
    expect(stripe.checkouts[0]).toMatchObject({
      currency: 'usd',
      unitAmount: 6400n,
      interval: 'month',
      customer: null,
      customerEmail: 'o@a.vn',
      successUrl: `${APP}/settings/billing/checkout?status=success`,
      metadata: { workspace_id: workspaceId, plan: 'growth', period: 'monthly' },
    });
  });

  it('chỉ owner được thanh toán', async () => {
    const { workspaceId } = await setup();
    const m = await seedMember(db, workspaceId, 'manager');
    const mctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, m.id))! };
    await expect(
      startStripeCheckout(
        mctx,
        { plan: 'growth', period: 'monthly', email: null },
        { stripe: new FakeStripe(), appUrl: APP },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cổng và hủy cần subscription Stripe; hủy ghi cancel_at_period_end', async () => {
    const { ctx, workspaceId } = await setup();
    const stripe = new FakeStripe();
    await expect(openStripePortal(ctx, { stripe, appUrl: APP })).rejects.toMatchObject({ code: 'CONFLICT' });
    await handleStripeWebhook(db, completed(workspaceId), { clock });
    expect((await openStripePortal(ctx, { stripe, appUrl: APP })).url).toContain('billing.stripe.test');
    expect(stripe.portals).toEqual(['cus_A']);
    await setStripeCancel(ctx, true, { stripe });
    expect(stripe.cancels).toEqual([['sub_A', true]]);
    expect((await billingStatus(ctx)).cancelAtPeriodEnd).toBe(true);
    expect(await currentPlanKey(ctx)).toBe('growth'); // vẫn dùng tới hết kỳ
  });
});

describe('webhook Stripe (core/ops)', () => {
  it('checkout xong → gói Growth active; sự kiện lặp lại → bỏ qua (idempotent)', async () => {
    const { ctx, workspaceId } = await setup();
    const e = completed(workspaceId);
    expect(await handleStripeWebhook(db, e, { clock })).toEqual({ status: 'applied', workspaceId });
    expect(await currentPlanKey(ctx)).toBe('growth');
    expect((await handleStripeWebhook(db, e, { clock })).status).toBe('duplicate');
    const rows = await db.select().from(schema.billingEvents).where(eq(schema.billingEvents.eventId, e.id));
    expect(rows).toHaveLength(1);
  });

  it('subscription.updated cập nhật kỳ + hủy cuối kỳ; deleted → Free', async () => {
    const { ctx, workspaceId } = await setup();
    await handleStripeWebhook(db, completed(workspaceId), { clock });
    const end = Math.floor(Date.parse('2026-11-23T00:00:00Z') / 1000);
    await handleStripeWebhook(
      db,
      ev('customer.subscription.updated', {
        id: 'sub_A',
        customer: 'cus_A',
        status: 'active',
        cancel_at_period_end: true,
        items: { data: [{ current_period_end: end }] },
        metadata: { workspace_id: workspaceId, plan: 'growth' },
      }),
      { clock },
    );
    const s = await billingStatus(ctx);
    expect(s.currentPeriodEnd?.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(s.cancelAtPeriodEnd).toBe(true);
    await handleStripeWebhook(
      db,
      ev('customer.subscription.deleted', { id: 'sub_A', customer: 'cus_A', status: 'canceled', metadata: {} }),
      { clock },
    );
    expect(await currentPlanKey(ctx)).toBe('free');
  });

  it('thanh toán thất bại → past_due + thông báo owner một lần, giữ mốc ân hạn; thanh toán lại → active', async () => {
    const { ctx, workspaceId, owner } = await setup();
    const enqueue = recordingEnqueue();
    await handleStripeWebhook(db, completed(workspaceId), { clock });
    const failed = () => ev('invoice.payment_failed', { id: 'in_1', customer: 'cus_A', subscription: 'sub_A' });
    await handleStripeWebhook(db, failed(), { clock, enqueue });
    const later = { now: () => new Date(NOW.getTime() + 2 * 86_400_000) };
    await handleStripeWebhook(db, failed(), { clock: later, enqueue });
    const s = await billingStatus(ctx, later);
    expect(s.status).toBe('past_due');
    expect(s.graceUntil?.toISOString()).toBe(new Date(NOW.getTime() + 7 * 86_400_000).toISOString());
    const notes = await listNotifications(ctx, owner.id);
    expect(notes.filter((n) => n.kind === 'billing_failed')).toHaveLength(1);
    expect(enqueue.calls.filter((c) => c.name === 'notify:send_email')).toHaveLength(1);
    await handleStripeWebhook(db, ev('invoice.paid', { id: 'in_2', customer: 'cus_A', subscription: 'sub_A' }), {
      clock,
    });
    const after = await billingStatus(ctx);
    expect(after.status).toBe('active');
    expect(after.graceUntil).toBeNull();
  });

  it('API Stripe mới: invoice mang subscription trong parent.subscription_details', async () => {
    const { ctx, workspaceId } = await setup();
    await handleStripeWebhook(db, completed(workspaceId), { clock });
    await handleStripeWebhook(
      db,
      ev('invoice.payment_failed', {
        id: 'in_3',
        customer: null,
        parent: { subscription_details: { subscription: 'sub_A' } },
      }),
      { clock },
    );
    expect((await billingStatus(ctx)).status).toBe('past_due');
  });

  it('sự kiện không xác định được workspace → lưu, không áp; loại không xử lý → bỏ qua', async () => {
    expect(
      (
        await handleStripeWebhook(
          db,
          ev('invoice.payment_failed', { id: 'in_x', customer: 'cus_none', subscription: 'sub_none' }),
        )
      ).status,
    ).toBe('unknown_workspace');
    expect((await handleStripeWebhook(db, ev('charge.refunded', { id: 'ch_1' }))).status).toBe('ignored');
  });

  it('cách ly: sự kiện của subscription workspace B không chạm workspace A', async () => {
    const a = await setup();
    const b = await setup();
    await handleStripeWebhook(db, completed(a.workspaceId, 'starter', 'sub_A', 'cus_A'), { clock });
    await handleStripeWebhook(db, completed(b.workspaceId, 'scale', 'sub_B', 'cus_B'), { clock });
    await handleStripeWebhook(
      db,
      ev('invoice.payment_failed', { id: 'in_b', customer: 'cus_B', subscription: 'sub_B' }),
      {
        clock,
      },
    );
    expect((await billingStatus(a.ctx)).status).toBe('active');
    expect(await currentPlanKey(a.ctx)).toBe('starter');
    expect((await billingStatus(b.ctx)).status).toBe('past_due');
    // metadata trỏ workspace A nhưng subscription là của B → áp cho B (khóa Stripe ưu tiên metadata).
    await handleStripeWebhook(
      db,
      ev('customer.subscription.updated', {
        id: 'sub_B',
        customer: 'cus_B',
        status: 'canceled',
        metadata: { workspace_id: a.workspaceId },
      }),
      { clock },
    );
    expect(await currentPlanKey(a.ctx)).toBe('starter');
    expect(await currentPlanKey(b.ctx)).toBe('free');
  });
});

describe('thông tin xuất hóa đơn', () => {
  it('lưu, sửa, kiểm tra hợp lệ', async () => {
    const { ctx } = await setup();
    expect(await getBillingProfile(ctx)).toBeNull();
    await saveBillingProfile(ctx, { companyName: 'Sao Mai', taxCode: '0312345678', invoiceEmail: 'kt@saomai.vn' });
    await saveBillingProfile(ctx, {
      companyName: 'Sao Mai JSC',
      taxCode: '',
      address: 'HCM',
      invoiceEmail: 'kt@saomai.vn',
    });
    expect(await getBillingProfile(ctx)).toMatchObject({ companyName: 'Sao Mai JSC', taxCode: null, address: 'HCM' });
    await expect(
      saveBillingProfile(ctx, { companyName: 'X', taxCode: 'abc', invoiceEmail: 'kt@saomai.vn' }),
    ).rejects.toThrow();
    await expect(saveBillingProfile(ctx, { companyName: 'X', invoiceEmail: 'not-email' })).rejects.toThrow();
  });
});
