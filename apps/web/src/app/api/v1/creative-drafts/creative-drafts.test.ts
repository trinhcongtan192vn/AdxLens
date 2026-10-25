import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as route from './route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

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
        reason: 'test drafts',
        override: true,
      });
    }
  }
  return { ws: workspace.id, owner, acc: acc.id };
}

async function upload(u: { id: string; email: string }, ws: string, acc: string, bytes: Uint8Array) {
  const user = asUser(u);
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], 'a.png'));
  form.set('ad_account_id', acc);
  const req = new Request('http://localhost/api/v1/creative-drafts', {
    method: 'POST',
    headers: { 'x-test-user': user.id, 'x-workspace-id': ws },
    body: form,
  });
  const res = await route.POST(req, { params: Promise.resolve({}) });
  return { status: res.status, body: (await res.json().catch(() => null)) as { id?: string } | null };
}

describe('bản nháp creative (ADR-0027)', () => {
  it('nhận PNG vào bucket private theo workspace; danh sách có URL ký; file không phải ảnh / quá lớn → 422', async () => {
    const { ws, owner, acc } = await setup();
    const r = await upload(owner, ws, acc, PNG);
    expect(r.status).toBe(200);
    expect([...server.storage.files.keys()][0]).toMatch(new RegExp(`^creatives/${ws}/${acc}/[0-9a-f-]+[.]png$`));
    const list = await call(route.GET, {
      user: asUser(owner),
      workspaceId: ws,
      path: `/api/v1/creative-drafts?ad_account_id=${acc}`,
    });
    expect(list.body).toMatchObject({ items: [{ id: r.body!.id, source: 'upload', status: 'ready' }] });
    expect((list.body as { items: { url: string }[] }).items[0]!.url).toContain('exp=3600');

    expect((await upload(owner, ws, acc, new TextEncoder().encode('<svg onload=1>'))).status).toBe(422);
    expect((await upload(owner, ws, acc, new Uint8Array(5 * 1024 * 1024 + 1).fill(0xff))).status).toBe(422);
    expect(server.storage.files.size).toBe(1);
  });

  it('cờ tắt → 404; buyer chưa được gán Client → 404; tài khoản workspace khác → 404', async () => {
    const off = await setup(false);
    expect((await upload(off.owner, off.ws, off.acc, PNG)).status).toBe(404);
    const { ws, acc } = await setup();
    const buyer = await seedMember(db, ws, 'buyer');
    // Buyer chưa được gán Client không thấy tài khoản → 404 (không lộ tài khoản tồn tại).
    expect((await upload(buyer, ws, acc, PNG)).status).toBe(404);
    const other = await setup();
    expect((await upload(other.owner, other.ws, acc, PNG)).status).toBe(404);
    expect(server.storage.files.size).toBe(0);
  });
});
