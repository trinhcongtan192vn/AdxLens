import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { listNotifications } from '@adxlens/core/notification';
import { handlePayosWebhook, handleStripeWebhook, runPayosRenewals } from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  billingStatus,
  confirmPayosOrder,
  currentPlanKey,
  payosSignature,
  periodAmountVnd,
  setCancelAtPeriodEnd,
  startPayosCheckout,
  verifyPayosWebhook,
  type PayosApi,
  type PayosWebhook,
  type StripeApi,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const KEY = 'checksum-test-key';
const T0 = new Date('2026-10-23T03:00:00Z');
const at = (days: number) => ({ now: () => new Date(T0.getTime() + days * 86_400_000) });
const APP = 'http://localhost:3000';

class FakePayos implements PayosApi {
  links: Parameters<PayosApi['createPaymentLink']>[0][] = [];
  status = new Map<number, string>();
  async createPaymentLink(p: Parameters<PayosApi['createPaymentLink']>[0]) {
    this.links.push(p);
    return { checkoutUrl: `https://pay.payos.test/${p.orderCode}`, paymentLinkId: `pl_${p.orderCode}` };
  }
  async getPaymentStatus(orderCode: number) {
    const l = this.links.find((x) => x.orderCode === orderCode);
    return { status: this.status.get(orderCode) ?? 'PENDING', amount: l?.amount ?? 0n };
  }
}

const noStripe = (): StripeApi => {
  throw new Error('không được gọi Stripe');
};

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  return { ctx, workspaceId: workspace.id, owner };
}

function webhook(orderCode: number, amount: number, extra: Record<string, unknown> = {}): PayosWebhook {
  const data = {
    orderCode,
    amount,
    code: '00',
    desc: 'success',
    reference: `FT${orderCode}`,
    paymentLinkId: `pl_${orderCode}`,
    description: `ADX ${orderCode}`,
    accountNumber: '12345678',
    transactionDateTime: '2026-10-23 10:00:00',
    currency: 'VND',
    counterAccountName: null,
    ...extra,
  };
  return { code: '00', success: true, data, signature: payosSignature(data, KEY) };
}

describe('chữ ký PayOS', () => {
  it('khớp cách ký của PayOS (khóa xếp chữ cái, null → rỗng)', () => {
    const data = { orderCode: 123, amount: 3000, description: 'VQRIO123', counterAccountName: null };
    const expected = createHmac('sha256', KEY)
      .update('amount=3000&counterAccountName=&description=VQRIO123&orderCode=123')
      .digest('hex');
    expect(payosSignature(data, KEY)).toBe(expected);
  });
  it('webhook đúng chữ ký → hợp lệ; sửa số tiền hoặc sai khóa → từ chối', () => {
    const w = webhook(1, 590000);
    expect(verifyPayosWebhook(w, KEY)).toBe(true);
    expect(verifyPayosWebhook({ ...w, data: { ...w.data, amount: 1 } }, KEY)).toBe(false);
    expect(verifyPayosWebhook(w, 'other-key')).toBe(false);
    expect(verifyPayosWebhook({ ...w, signature: 'zz' }, KEY)).toBe(false);
  });
});

describe('thanh toán theo kỳ qua PayOS', () => {
  it('số tiền kỳ: tháng = giá tháng; năm = 12 × 80% làm tròn nghìn', () => {
    expect(periodAmountVnd(1_490_000, 'monthly')).toBe(1_490_000n);
    expect(periodAmountVnd(1_490_000, 'annual')).toBe(14_304_000n);
  });

  it('tạo đơn + link; webhook đúng → gói active 1 tháng; webhook lặp → không gia hạn hai lần', async () => {
    const { ctx, workspaceId } = await setup();
    const payos = new FakePayos();
    const r = await startPayosCheckout(ctx, { plan: 'growth', period: 'monthly' }, { payos, appUrl: APP });
    expect(r.url).toBe(`https://pay.payos.test/${r.orderCode}`);
    expect(payos.links[0]).toMatchObject({
      amount: 1_490_000n,
      description: `ADX ${r.orderCode}`,
      returnUrl: `${APP}/settings/billing/checkout?provider=payos`,
    });
    const w = webhook(r.orderCode, 1_490_000);
    expect(await handlePayosWebhook(db, w, { clock: at(0) })).toEqual({ status: 'applied', workspaceId });
    const s = await billingStatus(ctx, at(0));
    expect(s).toMatchObject({ effectivePlan: 'growth', provider: 'payos', status: 'active' });
    expect(s.currentPeriodEnd?.toISOString()).toBe('2026-11-23T03:00:00.000Z');
    expect((await handlePayosWebhook(db, w, { clock: at(1) })).status).toBe('duplicate');
    expect((await billingStatus(ctx)).currentPeriodEnd?.toISOString()).toBe('2026-11-23T03:00:00.000Z');
  });

  it('gia hạn sớm cộng tiếp từ ngày hết kỳ hiện tại; kỳ năm cộng 12 tháng', async () => {
    const { ctx } = await setup();
    const payos = new FakePayos();
    const a = await startPayosCheckout(ctx, { plan: 'starter', period: 'monthly' }, { payos, appUrl: APP });
    await handlePayosWebhook(db, webhook(a.orderCode, 590_000), { clock: at(0) });
    const b = await startPayosCheckout(ctx, { plan: 'starter', period: 'annual' }, { payos, appUrl: APP });
    await handlePayosWebhook(db, webhook(b.orderCode, 5_664_000), { clock: at(20) });
    expect((await billingStatus(ctx)).currentPeriodEnd?.toISOString()).toBe('2027-11-23T03:00:00.000Z');
  });

  it('số tiền không khớp đơn → không ghi nhận; webhook mã lỗi → bỏ qua; đơn lạ (webhook thử) → unknown', async () => {
    const { ctx } = await setup();
    const r = await startPayosCheckout(
      ctx,
      { plan: 'growth', period: 'monthly' },
      { payos: new FakePayos(), appUrl: APP },
    );
    expect((await handlePayosWebhook(db, webhook(r.orderCode, 2_000))).status).toBe('amount_mismatch');
    expect(await currentPlanKey(ctx)).toBe('free');
    const failed = webhook(r.orderCode, 1_490_000, { code: '01' });
    expect((await handlePayosWebhook(db, failed)).status).toBe('ignored');
    expect((await handlePayosWebhook(db, webhook(123, 3000))).status).toBe('unknown_order');
  });

  it('ST04 tra cứu đơn: PAID → ghi nhận (không cần webhook); CANCELLED → hủy đơn', async () => {
    const { ctx } = await setup();
    const payos = new FakePayos();
    const r = await startPayosCheckout(ctx, { plan: 'growth', period: 'monthly' }, { payos, appUrl: APP });
    expect(await confirmPayosOrder(ctx, r.orderCode, { payos })).toBe('pending');
    payos.status.set(r.orderCode, 'PAID');
    expect(await confirmPayosOrder(ctx, r.orderCode, { payos })).toBe('paid');
    expect(await currentPlanKey(ctx)).toBe('growth');
    const c = await startPayosCheckout(ctx, { plan: 'scale', period: 'monthly' }, { payos, appUrl: APP });
    payos.status.set(c.orderCode, 'CANCELLED');
    expect(await confirmPayosOrder(ctx, c.orderCode, { payos })).toBe('canceled');
    expect(await currentPlanKey(ctx)).toBe('growth');
  });

  it('cách ly: không tra được đơn của workspace khác', async () => {
    const a = await setup();
    const b = await setup();
    const payos = new FakePayos();
    const r = await startPayosCheckout(b.ctx, { plan: 'growth', period: 'monthly' }, { payos, appUrl: APP });
    payos.status.set(r.orderCode, 'PAID');
    expect(await confirmPayosOrder(a.ctx, r.orderCode, { payos })).toBe('not_found');
    expect(await currentPlanKey(a.ctx)).toBe('free');
    expect(await currentPlanKey(b.ctx)).toBe('free');
  });

  it('đang trả qua Stripe thì không mở PayOS', async () => {
    const { ctx, workspaceId } = await setup();
    await handleStripeWebhook(db, {
      id: 'evt_s',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs',
          customer: 'cus',
          subscription: 'sub',
          metadata: { workspace_id: workspaceId, plan: 'growth' },
        },
      },
    });
    await expect(
      startPayosCheckout(ctx, { plan: 'growth', period: 'monthly' }, { payos: new FakePayos(), appUrl: APP }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('gia hạn PayOS (job hằng ngày)', () => {
  async function paid(days = 0) {
    const s = await setup();
    const r = await startPayosCheckout(
      s.ctx,
      { plan: 'growth', period: 'monthly' },
      { payos: new FakePayos(), appUrl: APP },
    );
    await handlePayosWebhook(db, webhook(r.orderCode, 1_490_000), { clock: at(days) });
    return s;
  }

  it('nhắc trước 7 ngày và 1 ngày, mỗi mốc một lần', async () => {
    const { ctx, owner } = await paid();
    const enqueue = recordingEnqueue();
    expect((await runPayosRenewals(db, { clock: at(20), enqueue })).reminded).toBe(0);
    expect((await runPayosRenewals(db, { clock: at(24), enqueue })).reminded).toBe(1);
    expect((await runPayosRenewals(db, { clock: at(25), enqueue })).reminded).toBe(0);
    expect((await runPayosRenewals(db, { clock: at(30.5), enqueue })).reminded).toBe(1);
    const notes = (await listNotifications(ctx, owner.id)).filter((n) => n.kind === 'billing_renewal');
    expect(notes).toHaveLength(2);
    expect(notes[0]!.params).toMatchObject({ plan: 'Growth', date: '2026-11-23' });
  });

  it('hết kỳ chưa trả → past_due từ ngày hết kỳ, 7 ngày sau về Free; trả kỳ mới → active', async () => {
    const { ctx } = await paid();
    await runPayosRenewals(db, { clock: at(32) });
    const s = await billingStatus(ctx, at(32));
    expect(s.status).toBe('past_due');
    expect(s.effectivePlan).toBe('growth');
    expect(await currentPlanKey(ctx, at(38))).toBe('free');
    const r = await startPayosCheckout(
      ctx,
      { plan: 'growth', period: 'monthly' },
      { payos: new FakePayos(), appUrl: APP },
    );
    await handlePayosWebhook(db, webhook(r.orderCode, 1_490_000), { clock: at(39) });
    const after = await billingStatus(ctx, at(39));
    expect(after.status).toBe('active');
    expect(after.currentPeriodEnd?.toISOString()).toBe(new Date(at(39).now().setUTCMonth(12)).toISOString());
  });

  it('đã hủy cuối kỳ → không nhắc, hết kỳ về Free (không quá hạn)', async () => {
    const { ctx } = await paid();
    await setCancelAtPeriodEnd(ctx, true, { stripe: noStripe });
    expect((await runPayosRenewals(db, { clock: at(24) })).reminded).toBe(0);
    expect((await runPayosRenewals(db, { clock: at(31) })).canceled).toBe(1);
    expect((await billingStatus(ctx, at(31))).status).toBe('canceled');
    expect(await currentPlanKey(ctx, at(31))).toBe('free');
  });

  it('hủy khi Free → CONFLICT', async () => {
    const { ctx } = await setup();
    await expect(setCancelAtPeriodEnd(ctx, true, { stripe: noStripe })).rejects.toMatchObject({ code: 'CONFLICT' });
    const [row] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.workspaceId, ctx.workspaceId));
    expect(row).toBeUndefined();
  });
});
