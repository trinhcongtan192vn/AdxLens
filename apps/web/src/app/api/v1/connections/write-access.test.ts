import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as writeAccess from './[id]/write-access/route';
import * as authorize from './meta/authorize/route';
import * as callback from './meta/callback/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function oauth(user: { id: string }, ws: string, scope: 'read' | 'write') {
  const r = await call(authorize.GET, {
    user,
    workspaceId: ws,
    path: `/api/v1/connections/meta/authorize?scope=${scope}`,
  });
  if (r.status !== 302) return { status: r.status, location: null as string | null };
  const location = new URL(r.headers.get('location')!);
  const cookie = r.headers.get('set-cookie')!.split(';')[0]!;
  const cb = await call(callback.GET, {
    user,
    workspaceId: ws,
    path: `/api/v1/connections/meta/callback?code=${location.searchParams.get('code')}&state=${encodeURIComponent(location.searchParams.get('state')!)}`,
    headers: { cookie },
  });
  return { status: cb.status, location: cb.headers.get('location') };
}

async function enableP2a(ws: string) {
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, { workspaceId: ws, key, staffUserId: pm.id, reason: 'test quyền ghi', override: true });
  }
}

describe('nâng quyền ghi Meta (P201, P2-01)', () => {
  it('ADR-0016: kết nối cấp sẵn ads_management nhưng quyền ghi vẫn TẮT tới khi Owner bật', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    await enableP2a(workspace.id);
    await oauth(asUser(owner), workspace.id, 'read');
    const [c] = await db.execute<{ write_enabled: boolean; scopes: string[] }>(
      sql`select write_enabled, scopes from app.meta_connections where workspace_id = ${workspace.id}`,
    );
    expect(c!.scopes).toEqual(expect.arrayContaining(['ads_read', 'ads_management', 'pages_show_list']));
    expect(c!.write_enabled).toBe(false);
  });

  it('cờ duyệt hành động tắt → không mở được OAuth ghi, API quyền ghi 404', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    expect((await oauth(u, workspace.id, 'write')).status).toBe(404);
    const r = await call(writeAccess.POST, {
      user: u,
      workspaceId: workspace.id,
      params: { id: '00000000-0000-4000-8000-000000000000' },
      body: { enabled: false },
    });
    expect(r.status).toBe(404);
  });

  it('cờ bật: Owner nâng quyền (mock) → quyền ghi bật; thu hồi; manager không nâng được', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    await enableP2a(workspace.id);
    const u = asUser(owner);
    await oauth(u, workspace.id, 'read');
    const w = await oauth(u, workspace.id, 'write');
    expect(w.location).toMatch(/\/connections\/write-access\?done=1$/);
    const [c] = await db.execute<{ id: string; write_enabled: boolean; scopes: string[] }>(
      sql`select id, write_enabled, scopes from app.meta_connections where workspace_id = ${workspace.id}`,
    );
    expect(c).toMatchObject({ write_enabled: true });
    expect(c!.scopes).toContain('ads_management');
    const revoke = await call(writeAccess.POST, {
      user: u,
      workspaceId: workspace.id,
      params: { id: c!.id },
      body: { enabled: false },
    });
    expect(revoke.status).toBe(204);
    const m = asUser(await seedMember(db, workspace.id, 'manager'));
    expect((await oauth(m, workspace.id, 'write')).status).toBe(403);
  });
});
