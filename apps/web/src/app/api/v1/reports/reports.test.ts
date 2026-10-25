import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import {
  closeTestDb,
  seedClient,
  seedMember,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as list from './route';
import * as one from './[id]/route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup(flagOn: boolean) {
  const { workspace, owner } = await seedWorkspace(db);
  const client = await seedClient(db, workspace.id, 'Linh');
  if (flagOn) {
    const pm = await seedStaff(db, true);
    await enableFlag(db, {
      workspaceId: workspace.id,
      key: 'p0_reports',
      staffUserId: pm.id,
      reason: 'test báo cáo',
      override: true,
    });
  }
  return { ws: workspace.id, u: asUser(owner), client };
}

const body = (clientId: string) => ({
  client_id: clientId,
  kind: 'periodic',
  date_from: '2026-10-16',
  date_to: '2026-10-22',
});

describe('API báo cáo', () => {
  it('cờ tắt → 404, không tạo, không enqueue (test "cờ tắt thì không chạy")', async () => {
    const { ws, u, client } = await setup(false);
    expect((await call(list.GET, { user: u, workspaceId: ws })).status).toBe(404);
    const r = await call(list.POST, { user: u, workspaceId: ws, body: body(client.id) });
    expect(r.status).toBe(404);
    expect(server.enqueue.calls).toEqual([]);
  });

  it('cờ bật: tạo 202 + enqueue dựng; xem; sửa; buyer không tạo được', async () => {
    const { ws, u, client } = await setup(true);
    const r = await call(list.POST, { user: u, workspaceId: ws, body: body(client.id) });
    expect(r.status).toBe(202);
    const id = (r.body as { report_id: string }).report_id;
    expect(server.enqueue.calls.map((c) => c.name)).toEqual(['report:build']);
    const g = await call(one.GET, { user: u, workspaceId: ws, params: { id } });
    expect(g.body).toMatchObject({ status: 'building', share_blocked: null });
    const p = await call(one.PATCH, { user: u, workspaceId: ws, params: { id }, body: { title: 'Tuần 42' } });
    expect(p.body).toMatchObject({ edits: { title: 'Tuần 42' } });
    const buyer = asUser(await seedMember(db, ws, 'buyer', [client.id]));
    expect((await call(list.POST, { user: buyer, workspaceId: ws, body: body(client.id) })).status).toBe(403);
  });
});
