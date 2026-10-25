import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { MetaApiError, type MetaReadApi } from '@adxlens/meta-client';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { resolveActor } from '@adxlens/core/tenancy';
import { keysFromEnv, listAssets, refreshAvailableAccounts, saveConnection } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 3).toString('base64') });
const now = () => new Date('2026-10-23T05:00:00Z');

async function setup(name = 'A') {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-a',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `m${name}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  return { ctx, connectionId };
}

describe('tài sản Meta (ADR-0016)', () => {
  it('làm mới tài khoản cũng lưu Page / Instagram / Pixel / Catalog, chỉ trong workspace của mình', async () => {
    const a = await setup('A');
    const b = await setup('B');
    await refreshAvailableAccounts(a.ctx, a.connectionId, {
      meta: new MockMetaRead(now),
      keys: KEYS.keys,
      clock: { now },
    });
    const assets = await listAssets(a.ctx);
    expect(assets.filter((x) => x.kind === 'page').map((x) => x.name)).toEqual(['Trang Mock A', 'Trang Mock B']);
    expect(assets.find((x) => x.kind === 'instagram')).toMatchObject({
      metaId: 'ig1',
      name: 'mock_a',
      parentId: 'page1',
    });
    expect(assets.filter((x) => x.kind === 'pixel')).toHaveLength(MOCK_ACCOUNTS.length);
    expect(assets.filter((x) => x.kind === 'catalog').map((x) => x.name)).toEqual(['Danh mục chính']);
    expect(await listAssets(b.ctx)).toEqual([]);
  });

  it('không lưu page access token dù Meta trả về', async () => {
    const { ctx, connectionId } = await setup();
    const mock = new MockMetaRead(now);
    const meta: MetaReadApi = Object.assign(Object.create(mock) as MetaReadApi, {
      listPages: async () => [{ id: 'p9', name: 'P9', category: null, access_token: 'PAGE-TOKEN-SECRET' } as never],
    });
    await refreshAvailableAccounts(ctx, connectionId, { meta, keys: KEYS.keys, clock: { now } });
    const rows = await db.execute(sql`select * from app.meta_assets where workspace_id = ${ctx.workspaceId}`);
    expect(JSON.stringify(rows)).not.toContain('PAGE-TOKEN-SECRET');
  });

  it('thiếu quyền một nhóm (người dùng bỏ chọn) → bỏ qua nhóm đó, tài khoản vẫn làm mới; giữ dữ liệu cũ của nhóm lỗi', async () => {
    const { ctx, connectionId } = await setup();
    const deps = { keys: KEYS.keys, clock: { now } };
    await refreshAvailableAccounts(ctx, connectionId, { meta: new MockMetaRead(now), ...deps });
    const denied = new MetaApiError(403, 200, null, 'OAuthException', 'Permissions error', null);
    const meta: MetaReadApi = Object.assign(Object.create(new MockMetaRead(now)) as MetaReadApi, {
      listPages: async () => {
        throw denied;
      },
      listBusinesses: async () => [],
    });
    const r = await refreshAvailableAccounts(ctx, connectionId, {
      meta,
      ...deps,
      clock: { now: () => new Date('2026-10-24T05:00:00Z') },
    });
    expect(r.status).toBe('ok');
    const assets = await listAssets(ctx);
    expect(assets.filter((x) => x.kind === 'page')).toHaveLength(2);
    expect(assets.filter((x) => x.kind === 'catalog')).toHaveLength(0);
  });
});
