import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as clientsRoute from './route';
import * as clientRoute from './[id]/route';
import * as adAccountsRoute from '../ad-accounts/route';
import * as assignRoute from '../ad-accounts/[id]/assign/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'Linh Shop 01' });
  return { ws: workspace.id, u: asUser(owner), acc };
}

type ClientsBody = {
  items: { id: string; name: string; ad_accounts: { id: string }[] }[];
  unconfirmed_accounts: number;
};

describe('API Client và gán tài khoản (S05, C01)', () => {
  it('S05: gán bằng tạo Client mới → C01 thấy Client, hết tài khoản chưa xác nhận', async () => {
    const { ws, u, acc } = await setup();
    const before = await call(clientsRoute.GET, { user: u, workspaceId: ws });
    expect((before.body as ClientsBody).unconfirmed_accounts).toBe(1);

    const r = await call(assignRoute.POST, {
      user: u,
      workspaceId: ws,
      params: { id: acc.id },
      body: { create_client_name: 'Linh Shop' },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ad_account_id: acc.id, assignment_status: 'confirmed' });

    const after = (await call(clientsRoute.GET, { user: u, workspaceId: ws })).body as ClientsBody;
    expect(after.unconfirmed_accounts).toBe(0);
    expect(after.items).toEqual([
      expect.objectContaining({ name: 'Linh Shop', ad_accounts: [expect.objectContaining({ id: acc.id })] }),
    ]);

    const list = await call(adAccountsRoute.GET, { user: u, workspaceId: ws });
    expect((list.body as { items: unknown[] }).items[0]).toMatchObject({ client_name: 'Linh Shop' });
  });

  it('body phải có đúng một trong client_id / create_client_name', async () => {
    const { ws, u, acc } = await setup();
    const r = await call(assignRoute.POST, { user: u, workspaceId: ws, params: { id: acc.id }, body: {} });
    expect(r.status).toBe(422);
  });

  it('đã gán Client khác → 409; bỏ gán rồi gán lại', async () => {
    const { ws, u, acc } = await setup();
    const a = await seedClient(db, ws, 'A');
    const b = await seedClient(db, ws, 'B');
    await call(assignRoute.POST, { user: u, workspaceId: ws, params: { id: acc.id }, body: { client_id: a.id } });
    const conflict = await call(assignRoute.POST, {
      user: u,
      workspaceId: ws,
      params: { id: acc.id },
      body: { client_id: b.id },
    });
    expect(conflict.status).toBe(409);
    expect((await call(assignRoute.DELETE, { user: u, workspaceId: ws, params: { id: acc.id } })).status).toBe(204);
    const ok = await call(assignRoute.POST, {
      user: u,
      workspaceId: ws,
      params: { id: acc.id },
      body: { client_id: b.id },
    });
    expect(ok.status).toBe(200);
  });

  it('tạo, đổi tên, lưu trữ Client', async () => {
    const { ws, u } = await setup();
    const created = await call(clientsRoute.POST, { user: u, workspaceId: ws, body: { name: '  Mới  ' } });
    const id = (created.body as { id: string }).id;
    expect(created.body).toMatchObject({ name: 'Mới' });
    await call(clientRoute.PATCH, { user: u, workspaceId: ws, params: { id }, body: { name: 'Đổi tên' } });
    expect((await call(clientRoute.GET, { user: u, workspaceId: ws, params: { id } })).body).toMatchObject({
      name: 'Đổi tên',
      archived: false,
    });
    await call(clientRoute.DELETE, { user: u, workspaceId: ws, params: { id } });
    expect(((await call(clientsRoute.GET, { user: u, workspaceId: ws })).body as ClientsBody).items).toEqual([]);
  });

  it('buyer không tạo/gán được (403), chỉ thấy Client của mình', async () => {
    const { ws, acc } = await setup();
    const mine = await seedClient(db, ws, 'Của buyer');
    await seedClient(db, ws, 'Khác');
    const buyer = asUser(await seedMember(db, ws, 'buyer', [mine.id]));
    expect((await call(clientsRoute.POST, { user: buyer, workspaceId: ws, body: { name: 'X' } })).status).toBe(403);
    const assign = await call(assignRoute.POST, {
      user: buyer,
      workspaceId: ws,
      params: { id: acc.id },
      body: { client_id: mine.id },
    });
    expect(assign.status).toBe(403);
    const list = (await call(clientsRoute.GET, { user: buyer, workspaceId: ws })).body as ClientsBody;
    expect(list.items.map((c) => c.name)).toEqual(['Của buyer']);
  });
});
