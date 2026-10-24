import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as bulk from './bulk/route';
import * as preview from './preview/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('API thao tác từ bảng chiến dịch (G4)', () => {
  it('cờ duyệt hành động tắt → 404 (không chạy); cờ bật: đổi ngân sách thiếu số tiền / nhân bản từ bảng → 422', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    const acc = await seedAdAccount(db, workspace.id, conn.id);
    const u = asUser(owner);
    const item = { ad_account_id: acc.id, action_type: 'pause_ad', target_meta_id: '123' };
    expect((await call(preview.POST, { user: u, workspaceId: workspace.id, body: item })).status).toBe(404);
    expect((await call(bulk.POST, { user: u, workspaceId: workspace.id, body: { items: [item] } })).status).toBe(404);
    // Cờ bật: kiểm đầu vào (cờ được kiểm trước đầu vào, nên 422 chỉ thấy khi cờ bật).
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
      await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test grid', override: true });
    }
    const noBudget = { ad_account_id: acc.id, action_type: 'set_adset_budget', target_meta_id: '123' };
    expect((await call(preview.POST, { user: u, workspaceId: workspace.id, body: noBudget })).status).toBe(422);
    const dup = { ad_account_id: acc.id, action_type: 'duplicate_adset', target_meta_id: '123' };
    expect((await call(bulk.POST, { user: u, workspaceId: workspace.id, body: { items: [dup] } })).status).toBe(422);
  });
});
