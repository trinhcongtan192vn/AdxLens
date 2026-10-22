import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { enableFlag } from '@adxlens/core/flags';
import { AppError } from '@adxlens/core/shared';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../test-utils';
import { route } from './route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

const echo = route({
  auth: 'workspace',
  body: z.object({ n: z.number() }),
  handler: async (ctx, { body }) => ({ ws: ctx.workspaceId, role: ctx.actor.role, n: body.n }),
});

describe('route()', () => {
  it('401 khi chưa đăng nhập', async () => {
    const r = await call(echo, { body: { n: 1 } });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('400 khi thiếu workspace; 403 khi không phải thành viên', async () => {
    const a = await seedWorkspace(db);
    const b = await seedWorkspace(db);
    const u = asUser(a.owner);
    expect((await call(echo, { user: u, body: { n: 1 } })).status).toBe(400);
    expect((await call(echo, { user: u, workspaceId: b.workspace.id, body: { n: 1 } })).status).toBe(403);
  });

  it('thành viên gọi được, nhận đúng workspace và vai trò', async () => {
    const a = await seedWorkspace(db);
    const r = await call(echo, {
      user: asUser(a.owner),
      workspaceId: a.workspace.id,
      body: { n: 2 },
    });
    expect(r).toMatchObject({ status: 200, body: { ws: a.workspace.id, role: 'owner', n: 2 } });
  });

  it('422 khi body sai schema, kèm đường dẫn lỗi', async () => {
    const a = await seedWorkspace(db);
    const r = await call(echo, {
      user: asUser(a.owner),
      workspaceId: a.workspace.id,
      body: { n: 'x' },
    });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({
      error: { code: 'VALIDATION_FAILED', details: { issues: [{ path: 'n' }] } },
    });
  });

  it('403 khi vai trò không đủ quyền', async () => {
    const a = await seedWorkspace(db);
    const buyer = await seedMember(db, a.workspace.id, 'buyer');
    const guarded = route({
      auth: 'workspace',
      permission: 'members.manage',
      handler: async () => ({}),
    });
    const r = await call(guarded, { user: asUser(buyer), workspaceId: a.workspace.id });
    expect(r.status).toBe(403);
  });

  it('cờ tắt → 404, handler không chạy; cờ bật → chạy (test "cờ tắt thì không chạy")', async () => {
    const a = await seedWorkspace(db);
    let ran = 0;
    const p1 = route({
      auth: 'workspace',
      flag: 'p1_recommendations',
      handler: async () => {
        ran++;
        return {};
      },
    });
    const off = await call(p1, { user: asUser(a.owner), workspaceId: a.workspace.id });
    expect(off.status).toBe(404);
    expect(JSON.stringify(off.body)).not.toMatch(/p1|recommendation/i);
    expect(ran).toBe(0);

    const pm = await seedStaff(db, true);
    await enableFlag(db, {
      workspaceId: a.workspace.id,
      key: 'p0_reports',
      staffUserId: pm.id,
      reason: 'test bật',
    });
    await enableFlag(db, {
      workspaceId: a.workspace.id,
      key: 'p1_recommendations',
      staffUserId: pm.id,
      reason: 'test bật',
    });
    expect((await call(p1, { user: asUser(a.owner), workspaceId: a.workspace.id })).status).toBe(200);
    expect(ran).toBe(1);
  });

  it('AppError trả đúng mã; lỗi lạ trả 500 không lộ thông điệp', async () => {
    const a = await seedWorkspace(db);
    const u = asUser(a.owner);
    const conflict = route({
      auth: 'workspace',
      handler: async () => {
        throw new AppError('CONFLICT', 'Trùng');
      },
    });
    expect((await call(conflict, { user: u, workspaceId: a.workspace.id })).status).toBe(409);
    const boom = route({
      auth: 'workspace',
      handler: async () => {
        throw new Error('postgres://user:secret@host lỗi kết nối');
      },
    });
    const r = await call(boom, { user: u, workspaceId: a.workspace.id });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });

  it('chặn request ghi cross-origin dùng cookie; Bearer không bị chặn', async () => {
    const a = await seedWorkspace(db);
    const u = asUser(a.owner);
    const r = await call(echo, {
      user: u,
      workspaceId: a.workspace.id,
      body: { n: 1 },
      headers: { origin: 'https://evil.example', host: 'localhost' },
    });
    expect(r.status).toBe(403);
    const ok = await call(echo, {
      user: u,
      workspaceId: a.workspace.id,
      body: { n: 1 },
      headers: { origin: 'https://evil.example', host: 'localhost', authorization: 'Bearer x' },
    });
    expect(ok.status).toBe(200);
  });

  it('route staff trả 404 cho người không phải staff', async () => {
    const a = await seedWorkspace(db);
    const admin = route({
      auth: 'staff',
      handler: async (ctx) => ({ can: ctx.staff.canEnableFlags }),
    });
    expect((await call(admin, { user: asUser(a.owner) })).status).toBe(404);
    const pm = await seedStaff(db, true);
    expect(await call(admin, { user: asUser(pm) })).toMatchObject({
      status: 200,
      body: { can: true },
    });
  });
});
