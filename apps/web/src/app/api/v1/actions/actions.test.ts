import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as undoRoute from './[id]/undo/route';
import * as itemRoute from './[id]/route';
import * as listRoute from './route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('API nhật ký hành động (P203/P204)', () => {
  it('cờ duyệt hành động tắt thì không chạy (404)', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    const params = { id: '00000000-0000-4000-8000-000000000000' };
    expect((await call(listRoute.GET, { user: u, workspaceId: workspace.id })).status).toBe(404);
    expect((await call(itemRoute.GET, { user: u, workspaceId: workspace.id, params })).status).toBe(404);
    expect((await call(undoRoute.POST, { method: 'POST', user: u, workspaceId: workspace.id, params })).status).toBe(
      404,
    );
  });
});
