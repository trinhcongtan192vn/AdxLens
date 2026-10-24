import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as authorize from './meta/authorize/route';
import * as callback from './meta/callback/route';
import * as available from './[id]/ad-accounts/route';
import * as importRoute from '../ad-accounts/import/route';
import * as syncStatusRoute from '../ad-accounts/[id]/sync-status/route';
import * as syncRoute from '../ad-accounts/[id]/sync/route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

/** Chạy authorize (mock) để lấy state + cookie như trình duyệt. */
async function startOAuth(user: { id: string }, ws: string) {
  const r = await call(authorize.GET, { user, workspaceId: ws, path: '/api/v1/connections/meta/authorize' });
  expect(r.status).toBe(302);
  const location = new URL(r.headers.get('location')!);
  const cookie = r.headers.get('set-cookie')!.split(';')[0]!;
  return { state: location.searchParams.get('state')!, code: location.searchParams.get('code')!, cookie };
}

describe('OAuth Meta (META_MOCK=1)', () => {
  it('authorize → callback lưu kết nối mã hóa và chuyển tới S04; không lộ token', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    const { state, code, cookie } = await startOAuth(u, workspace.id);
    expect(cookie).toMatch(/^meta_oauth=/);
    const r = await call(callback.GET, {
      user: u,
      workspaceId: workspace.id,
      path: `/api/v1/connections/meta/callback?code=${code}&state=${encodeURIComponent(state)}`,
      headers: { cookie },
    });
    expect(r.status).toBe(302);
    const loc = r.headers.get('location')!;
    expect(loc).toMatch(/\/connections\/select\?connection=[0-9a-f-]{36}$/);
    const connId = new URL(loc).searchParams.get('connection')!;

    const rows = await db.execute<{ c: string }>(sql`select count(*)::text as c from app.meta_available_accounts`);
    expect(rows[0]!.c).toBe('4');
    const conn = await db.execute<{ t: string }>(
      sql`select encode(token_ciphertext, 'escape') as t from app.meta_connections`,
    );
    expect(conn[0]!.t).not.toContain('mock-read');

    const list = await call(available.GET, { user: u, workspaceId: workspace.id, params: { id: connId } });
    expect((list.body as { items: unknown[] }).items).toHaveLength(4);
    expect(JSON.stringify([r.headers, list.body])).not.toMatch(/mock-read-/);
  });

  it('state sai → 403, không lưu gì', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    const { code, cookie } = await startOAuth(u, workspace.id);
    const r = await call(callback.GET, {
      user: u,
      workspaceId: workspace.id,
      path: `/api/v1/connections/meta/callback?code=${code}&state=gia-mao`,
      headers: { cookie },
    });
    expect(r.status).toBe(403);
    expect(await db.execute(sql`select 1 from app.meta_connections`)).toHaveLength(0);
  });

  it('cookie state của workspace khác (hoặc user khác) → 403', async () => {
    const a = await seedWorkspace(db);
    const b = await seedWorkspace(db);
    const ua = asUser(a.owner);
    const { state, code, cookie } = await startOAuth(ua, a.workspace.id);
    // Owner A cũng là thành viên B, nhưng state gắn với workspace A.
    await db.execute(
      sql`insert into app.memberships (workspace_id, user_id, role) values (${b.workspace.id}, ${a.owner.id}, 'manager')`,
    );
    const r = await call(callback.GET, {
      user: ua,
      workspaceId: b.workspace.id,
      path: `/api/v1/connections/meta/callback?code=${code}&state=${encodeURIComponent(state)}`,
      headers: { cookie },
    });
    expect(r.status).toBe(403);
  });

  it('người dùng từ chối trên Meta → về S02 với lỗi', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const r = await call(callback.GET, {
      user: asUser(owner),
      workspaceId: workspace.id,
      path: '/api/v1/connections/meta/callback?error=access_denied',
    });
    expect(r.headers.get('location')).toMatch(/\/connections\?error=denied$/);
  });

  it('sau Cloudflare Tunnel (request.url là localhost) → chuyển hướng theo APP_URL công khai', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    vi.stubEnv('APP_URL', 'https://adxlens-dev.sctech.io.vn');
    try {
      const r = await call(callback.GET, {
        user: asUser(owner),
        workspaceId: workspace.id,
        path: '/api/v1/connections/meta/callback?error=access_denied',
      });
      expect(r.headers.get('location')).toBe('https://adxlens-dev.sctech.io.vn/connections?error=denied');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('buyer không bắt đầu kết nối được', async () => {
    const { workspace } = await seedWorkspace(db);
    const buyer = asUser(await seedMember(db, workspace.id, 'buyer'));
    expect((await call(authorize.GET, { user: buyer, workspaceId: workspace.id })).status).toBe(403);
  });

  it('nhập tài khoản sau khi kết nối', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    const { state, code, cookie } = await startOAuth(u, workspace.id);
    const cb = await call(callback.GET, {
      user: u,
      workspaceId: workspace.id,
      path: `/api/v1/connections/meta/callback?code=${code}&state=${encodeURIComponent(state)}`,
      headers: { cookie },
    });
    const connId = new URL(cb.headers.get('location')!).searchParams.get('connection')!;
    const r = await call(importRoute.POST, {
      user: u,
      workspaceId: workspace.id,
      body: { connection_id: connId, meta_account_ids: ['act_100000001'] },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ items: [{ meta_account_id: 'act_100000001', assignment_status: 'suggested' }] });

    // ADR-0005: nhập xong là backfill 90 ngày (13 lô 7 ngày).
    const backfills = server.enqueue.calls.filter((c) => c.name === 'sync:backfill_account');
    expect(backfills).toHaveLength(13);
    const adAccountId = (r.body as { items: { ad_account_id: string }[] }).items[0]!.ad_account_id;
    const st = await call(syncStatusRoute.GET, { user: u, workspaceId: workspace.id, params: { id: adAccountId } });
    expect(st.body).toMatchObject({
      status: 'queued',
      progress: { days_done: 0, days_total: 90 },
      reconciliation: { status: 'pending' },
    });

    // Đang chạy → thử lại không tạo lần mới.
    const again = await call(syncRoute.POST, { user: u, workspaceId: workspace.id, params: { id: adAccountId } });
    expect(again.body).toMatchObject({ created: false });
    expect(server.enqueue.calls.filter((c) => c.name === 'sync:backfill_account')).toHaveLength(13);
  });
});
