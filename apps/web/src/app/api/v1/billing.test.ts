import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@adxlens/config/env';
import { billingStatus, signStripePayload } from '@adxlens/core/billing';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../test-utils';
import * as cancelRoute from './billing/cancel/route';
import * as checkoutRoute from './billing/checkout/route';
import * as profileRoute from './billing/profile/route';
import * as webhookRoute from './webhooks/stripe/route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
const SECRET = 'whsec_route_test';
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  resetEnvCache();
});
afterEach(() => {
  uninstallTestServer();
  delete process.env.STRIPE_WEBHOOK_SECRET;
  resetEnvCache();
});
afterAll(() => closeTestDb());

describe('API thanh toán (027)', () => {
  it('owner tạo checkout → URL Stripe; manager bị chặn', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const r = await call(checkoutRoute.POST, {
      user: asUser(owner),
      workspaceId: workspace.id,
      body: { plan: 'starter', period: 'annual' },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ url: 'https://checkout.stripe.test/cs_test' });
    expect(server.stripe.calls[0]).toMatchObject({ op: 'checkout', args: { interval: 'year' } });
    const m = await seedMember(db, workspace.id, 'manager');
    const denied = await call(checkoutRoute.POST, {
      user: asUser(m),
      workspaceId: workspace.id,
      body: { plan: 'starter', period: 'monthly' },
    });
    expect(denied.status).toBe(403);
  });

  it('gói Free không có gì để hủy → 409', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const r = await call(cancelRoute.POST, { user: asUser(owner), workspaceId: workspace.id, body: { cancel: true } });
    expect(r.status).toBe(409);
  });

  it('thông tin xuất hóa đơn: lưu + đọc; mã số thuế sai → 422', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    const put = await call(profileRoute.PUT, {
      method: 'PUT',
      user: u,
      workspaceId: workspace.id,
      body: { companyName: 'Sao Mai', taxCode: '0312345678', invoiceEmail: 'kt@saomai.vn' },
    });
    expect(put.status).toBe(200);
    const get = await call(profileRoute.GET, { user: u, workspaceId: workspace.id });
    expect(get.body).toMatchObject({ profile: { company_name: 'Sao Mai', tax_code: '0312345678' } });
    const bad = await call(profileRoute.PUT, {
      method: 'PUT',
      user: u,
      workspaceId: workspace.id,
      body: { companyName: 'Sao Mai', taxCode: 'MST?', invoiceEmail: 'kt@saomai.vn' },
    });
    expect(bad.status).toBe(422);
  });

  it('webhook: chữ ký sai → 400, không đổi gói; chữ ký đúng → áp sự kiện', async () => {
    const { workspace } = await seedWorkspace(db);
    const event = {
      id: 'evt_route_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { workspace_id: workspace.id, plan: 'growth', period: 'monthly' },
        },
      },
    };
    const payload = JSON.stringify(event);
    const bad = await call(webhookRoute.POST, {
      body: event,
      headers: { 'stripe-signature': signStripePayload(payload, 'whsec_wrong') },
    });
    expect(bad.status).toBe(400);
    expect((await billingStatus({ db, workspaceId: workspace.id })).effectivePlan).toBe('free');
    const ok = await call(webhookRoute.POST, {
      body: event,
      headers: { 'stripe-signature': signStripePayload(payload, SECRET) },
    });
    expect(ok.status).toBe(200);
    expect((await billingStatus({ db, workspaceId: workspace.id })).effectivePlan).toBe('growth');
  });
});
