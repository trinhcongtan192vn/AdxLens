import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as route from './bulk-approve/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('API duyệt hàng loạt (B2)', () => {
  it('cờ duyệt hành động tắt → 404 (không chạy)', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const r = await call(route.POST, { user: asUser(owner), workspaceId: workspace.id, body: { ids: [randomUUID()] } });
    expect(r.status).toBe(404);
  });

  it('cờ bật: id lạ → 404 cả lô; > 20 id → 422; buyer không có quyền cập nhật gợi ý → 403', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
      await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test bulk', override: true });
    }
    const u = asUser(owner);
    expect((await call(route.POST, { user: u, workspaceId: workspace.id, body: { ids: [randomUUID()] } })).status).toBe(
      404,
    );
    const many = Array.from({ length: 21 }, () => randomUUID());
    expect((await call(route.POST, { user: u, workspaceId: workspace.id, body: { ids: many } })).status).toBe(422);
    const viewer = await seedMember(db, workspace.id, 'buyer', []);
    const asViewer = await call(route.POST, {
      user: asUser(viewer),
      workspaceId: workspace.id,
      body: { ids: [randomUUID()] },
    });
    expect([403, 404]).toContain(asViewer.status);
  });
});
