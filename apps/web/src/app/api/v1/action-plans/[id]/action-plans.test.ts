import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { enableFlag } from '@adxlens/core/flags';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedMember,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../../test-utils';
import * as approve from './approve/route';
import * as cancel from './cancel/route';
import * as route from './route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup(flags = true) {
  const { workspace, owner } = await seedWorkspace(db);
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id);
  if (flags) {
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test plans',
        override: true,
      });
    }
  }
  const [plan] = await db
    .insert(schema.actionPlans)
    .values({
      workspaceId: workspace.id,
      adAccountId: acc.id,
      title: 'Serum sale',
      source: 'agent',
      steps: [{ key: 'ad', kind: 'create_ad', adset: 'as_khong_co', creative: 'cr_khong_co', name: 'QC' }],
      results: [{ key: 'ad', status: 'pending' }],
      createdBy: owner.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  return { workspace, owner, plan: plan!, u: { user: asUser(owner), workspaceId: workspace.id } };
}

describe('/api/v1/action-plans/[id] (ADR-0031)', () => {
  it('cờ P2a tắt → 404', async () => {
    const s = await setup(false);
    expect((await call(route.GET, { ...s.u, params: { id: s.plan.id } })).status).toBe(404);
  });

  it('xem đủ tham số; duyệt bước không hợp lệ → 422 kèm kiểm từng bước, vẫn chờ duyệt; hủy; buyer không thấy', async () => {
    const s = await setup();
    const got = await call(route.GET, { ...s.u, params: { id: s.plan.id } });
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({
      title: 'Serum sale',
      status: 'proposed',
      steps: [{ key: 'ad', kind: 'create_ad', name: 'QC', image_url: null }],
      can_approve: true,
      expired: false,
    });

    const bad = await call(approve.POST, { ...s.u, method: 'POST', params: { id: s.plan.id } });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).toContain('checks');
    expect((await call(route.GET, { ...s.u, params: { id: s.plan.id } })).body).toMatchObject({ status: 'proposed' });

    const buyer = await seedMember(db, s.workspace.id, 'buyer');
    const bu = { user: asUser(buyer), workspaceId: s.workspace.id };
    expect((await call(route.GET, { ...bu, params: { id: s.plan.id } })).status).toBe(404);

    const c = await call(cancel.POST, { ...s.u, method: 'POST', params: { id: s.plan.id } });
    expect(c.body).toMatchObject({ status: 'canceled' });
    expect((await call(cancel.POST, { ...s.u, method: 'POST', params: { id: s.plan.id } })).status).toBe(409);
  });
});
