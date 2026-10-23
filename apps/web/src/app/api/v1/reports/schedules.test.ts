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
import * as list from '../report-schedules/route';
import * as one from '../report-schedules/[id]/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup(flag: boolean) {
  const { workspace, owner } = await seedWorkspace(db);
  if (flag) {
    const pm = await seedStaff(db, true);
    await enableFlag(db, {
      workspaceId: workspace.id,
      key: 'p0_reports',
      staffUserId: pm.id,
      reason: 'test lich gui',
      override: true,
    });
  }
  const client = await seedClient(db, workspace.id, 'Linh');
  return { ws: workspace.id, u: asUser(owner), client };
}

const body = (clientId: string) => ({
  client_id: clientId,
  cadence: 'weekly',
  weekday: 1,
  send_hour: 9,
  timezone: 'Asia/Ho_Chi_Minh',
  mode: 'approval',
  delivery: 'pdf',
  recipients: ['khach@linh.vn'],
});

describe('API lịch gửi báo cáo (R05)', () => {
  it('cờ tắt → 404 (test "cờ tắt thì không chạy")', async () => {
    const { ws, u, client } = await setup(false);
    expect((await call(list.POST, { user: u, workspaceId: ws, body: body(client.id) })).status).toBe(404);
  });

  it('tạo 201 → danh sách → sửa → xóa; buyer 403; dữ liệu sai 422', async () => {
    const { ws, u, client } = await setup(true);
    const r = await call(list.POST, { user: u, workspaceId: ws, body: body(client.id) });
    expect(r.status).toBe(201);
    const id = (r.body as { id: string }).id;
    const l = await call(list.GET, { user: u, workspaceId: ws });
    expect((l.body as { items: { client: { name: string }; mode: string }[] }).items).toMatchObject([
      { client: { name: 'Linh' }, mode: 'approval' },
    ]);
    const p = await call(one.PATCH, {
      user: u,
      workspaceId: ws,
      params: { id },
      method: 'PATCH',
      body: { ...body(client.id), cadence: 'monthly', month_day: 1 },
    });
    expect(p.body).toMatchObject({ cadence: 'monthly', month_day: 1, weekday: null });
    expect(
      (await call(list.POST, { user: u, workspaceId: ws, body: { ...body(client.id), recipients: ['x'] } })).status,
    ).toBe(422);
    const buyer = asUser(await seedMember(db, ws, 'buyer', [client.id]));
    expect((await call(list.GET, { user: buyer, workspaceId: ws })).status).toBe(403);
    expect((await call(one.DELETE, { user: u, workspaceId: ws, params: { id }, method: 'DELETE' })).status).toBe(204);
  });
});
