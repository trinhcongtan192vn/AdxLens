import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { enableFlag } from '@adxlens/core/flags';
import { hashSharePassword } from '@adxlens/core/reporting';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as links from './[id]/share-links/route';
import * as revoke from '../share-links/[id]/route';
import * as unlock from '../public/share/[token]/unlock/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
  process.env.INTERNAL_SIGNING_SECRET ??= 'x'.repeat(40);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup(confirmed: boolean) {
  const { workspace, owner } = await seedWorkspace(db);
  const pm = await seedStaff(db, true);
  await enableFlag(db, {
    workspaceId: workspace.id,
    key: 'p0_reports',
    staffUserId: pm.id,
    reason: 'test chia sẻ',
    override: true,
  });
  const client = await seedClient(db, workspace.id, 'Linh');
  const conn = await seedConnection(db, workspace.id, owner.id);
  await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed });
  const [report] = await db
    .insert(schema.reports)
    .values({
      workspaceId: workspace.id,
      clientId: client.id,
      kind: 'periodic',
      dateFrom: '2026-10-16',
      dateTo: '2026-10-22',
      locale: 'vi',
      status: 'ready',
      content: {},
      templateVersion: 'v1',
      createdBy: owner.id,
    })
    .returning();
  return { ws: workspace.id, u: asUser(owner), reportId: report!.id };
}

describe('API chia sẻ', () => {
  it('tạo link 201 (url công khai) → danh sách → thu hồi 204', async () => {
    const { ws, u, reportId } = await setup(true);
    const r = await call(links.POST, {
      user: u,
      workspaceId: ws,
      params: { id: reportId },
      body: { expires_in_days: 30 },
    });
    expect(r.status).toBe(201);
    expect((r.body as { url: string }).url).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);
    const list = await call(links.GET, { user: u, workspaceId: ws, params: { id: reportId } });
    const items = (list.body as { items: { id: string; view_count: number }[] }).items;
    expect(items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('password_hash');
    expect(
      (await call(revoke.DELETE, { user: u, workspaceId: ws, params: { id: items[0]!.id }, method: 'DELETE' })).status,
    ).toBe(204);
  });

  it('chưa xác nhận gán → 422 REPORT_BLOCKED', async () => {
    const { ws, u, reportId } = await setup(false);
    const r = await call(links.POST, { user: u, workspaceId: ws, params: { id: reportId }, body: {} });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: { code: 'REPORT_BLOCKED' } });
  });

  it('mở khóa bằng mật khẩu: đúng → cookie ký; sai → 403', async () => {
    const { ws, reportId } = await setup(true);
    const token = 'T'.repeat(43);
    await db.insert(schema.shareLinks).values({
      workspaceId: ws,
      reportId,
      token,
      passwordHash: hashSharePassword('mat-khau-1'),
      createdBy: (await db.select().from(schema.users))[0]!.id,
    });
    const bad = await call(unlock.POST, { params: { token }, body: { password: 'sai' } });
    expect(bad.status).toBe(403);
    const ok = await call(unlock.POST, { params: { token }, body: { password: 'mat-khau-1' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toMatch(/^share_[0-9a-f]{8}=.+; Path=\/r\/; HttpOnly/);
  });
});
