import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedClient, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { MockGoogleAnalytics, MockShopee, MockShopify } from '@adxlens/store-client/mock';
import { keysFromEnv } from '@adxlens/core/connections';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  assignStoreClient,
  disconnectStore,
  dueStoreSyncs,
  listStoreConnections,
  runStoreSync,
  saveStoreConnection,
  storeSummary,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 31).toString('base64') });
const clock = { now: () => new Date('2026-10-25T03:00:00Z') };
const TOKEN = 'shpat_bi_mat_0123456789';

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const client = await seedClient(db, workspace.id, 'Khách Shop');
  return { ctx, wctx: { db, workspaceId: workspace.id }, workspaceId: workspace.id, client };
}
const shop = (clientId: string | null) => ({
  provider: 'shopify' as const,
  externalId: 'sao-mai.myshopify.com',
  name: 'Sao Mai',
  currency: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
  token: TOKEN,
  clientId,
});

describe('kết nối cửa hàng (ADR-0029)', () => {
  it('lưu token mã hóa (không plaintext, không trả ra); buyer không kết nối được; Client workspace khác bị chặn', async () => {
    const s = await setup();
    const buyer = await seedMember(db, s.workspaceId, 'buyer');
    const bctx = { ...s.ctx, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    await expect(saveStoreConnection(bctx, shop(null), KEYS)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const other = await setup();
    await expect(saveStoreConnection(s.ctx, shop(other.client.id), KEYS)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const { id } = await saveStoreConnection(s.ctx, shop(s.client.id), KEYS);
    const [raw] = await db.select().from(schema.storeConnections).where(eq(schema.storeConnections.id, id));
    expect(raw!.tokenCiphertext!.toString('utf8')).not.toContain(TOKEN);
    const list = await listStoreConnections(s.wctx);
    expect(list).toEqual([expect.objectContaining({ id, clientId: s.client.id, name: 'Sao Mai' })]);
    expect(JSON.stringify(list)).not.toContain('shpat');
    // Kết nối lại cùng shop: thay token, giữ một dòng, giữ Client.
    await saveStoreConnection(s.ctx, { ...shop(null), token: 'shpat_moi_9999999999' }, KEYS);
    expect(await listStoreConnections(s.wctx)).toEqual([expect.objectContaining({ id, clientId: s.client.id })]);
  });

  it('worker đồng bộ (ghi đè theo ngày) → tổng doanh thu / đơn theo Client; lỗi 401 → cần kết nối lại; ngắt kết nối xóa token + số liệu', async () => {
    const s = await setup();
    const { id } = await saveStoreConnection(s.ctx, shop(s.client.id), KEYS);
    const deps = { shopify: new MockShopify(), keys: KEYS.keys, clock };
    expect(await runStoreSync(s.wctx, { connectionId: id, days: 30 }, deps)).toEqual({ status: 'ok', days: 30 });
    expect(await runStoreSync(s.wctx, { connectionId: id, days: 3 }, deps)).toEqual({ status: 'ok', days: 3 });
    const sum = await storeSummary(s.wctx, [s.client.id], { from: '2026-10-22', to: '2026-10-24' });
    // Mock: n = 8 + (ngày % 5) đơn, 450.000đ/đơn → 22: 10, 23: 11, 24: 12.
    expect(sum).toMatchObject({ connections: 1, currency: 'VND', orders: 33, revenue: '14850000.0000' });
    expect(await storeSummary(s.wctx, [], { from: '2026-10-22', to: '2026-10-24' })).toMatchObject({ connections: 0 });

    const failing = {
      ...deps,
      shopify: { ...new MockShopify(), dailyOrders: async () => Promise.reject(new Error('SHOPIFY_HTTP_401')) },
    };
    expect(await runStoreSync(s.wctx, { connectionId: id }, failing as never)).toEqual({
      status: 'failed',
      code: 'SHOPIFY_HTTP_401',
    });
    expect((await listStoreConnections(s.wctx))[0]).toMatchObject({ status: 'error', lastError: 'SHOPIFY_HTTP_401' });

    await assignStoreClient(s.ctx, id, null);
    await disconnectStore(s.ctx, id);
    const [raw] = await db.select().from(schema.storeConnections).where(eq(schema.storeConnections.id, id));
    expect(raw).toMatchObject({ status: 'revoked', tokenCiphertext: null });
    expect(await db.select().from(schema.storeDaily).where(eq(schema.storeDaily.connectionId, id))).toEqual([]);
    expect(await runStoreSync(s.wctx, { connectionId: id }, deps)).toEqual({ status: 'skipped' });
    expect(await listStoreConnections(s.wctx)).toEqual([]);
  });

  it('cách ly: workspace khác không đồng bộ / gắn / ngắt được kết nối; lịch hằng ngày theo giờ shop', async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await saveStoreConnection(a.ctx, shop(a.client.id), KEYS);
    expect(
      await runStoreSync(b.wctx, { connectionId: id }, { shopify: new MockShopify(), keys: KEYS.keys, clock }),
    ).toEqual({
      status: 'skipped',
    });
    await expect(assignStoreClient(b.ctx, id, null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(disconnectStore(b.ctx, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // 20:00 UTC = 03:00 giờ VN → đến giờ; 03:00 UTC = 10:00 giờ VN → chưa.
    expect(await dueStoreSyncs(db, new Date('2026-10-24T20:00:00Z'))).toEqual([
      { workspaceId: a.workspaceId, connectionId: id },
    ]);
    expect(await dueStoreSyncs(db, new Date('2026-10-25T03:00:00Z'))).toEqual([]);
  });

  it('GA4: refresh token mã hóa; đồng bộ phiên / chuyển đổi; không cộng doanh thu GA4 vào doanh thu cửa hàng', async () => {
    const s = await setup();
    await saveStoreConnection(s.ctx, shop(s.client.id), KEYS);
    const { id } = await saveStoreConnection(
      s.ctx,
      {
        ...shop(s.client.id),
        provider: 'ga4',
        externalId: '123456789',
        name: 'GA4 Sao Mai',
        token: '1//refresh_bi_mat',
      },
      KEYS,
    );
    const deps = { shopify: new MockShopify(), ga4: new MockGoogleAnalytics(), keys: KEYS.keys, clock };
    for (const c of await listStoreConnections(s.wctx)) {
      expect((await runStoreSync(s.wctx, { connectionId: c.id, days: 30 }, deps)).status).toBe('ok');
    }
    const sum = await storeSummary(s.wctx, [s.client.id], { from: '2026-10-22', to: '2026-10-24' });
    // Mock GA4: phiên = 400 + ngày×3, chuyển đổi = 20 + ngày%4 → 22..24: 1407 phiên, 22 + 23 + 20 = 65 chuyển đổi.
    expect(sum).toMatchObject({
      connections: 2,
      orders: 33,
      revenue: '14850000.0000',
      sessions: 1407,
      conversions: 65,
    });
    const [raw] = await db.select().from(schema.storeConnections).where(eq(schema.storeConnections.id, id));
    expect(raw!.tokenCiphertext!.toString('utf8')).not.toContain('refresh_bi_mat');
  });

  it('Shopee: mỗi lần đồng bộ lưu refresh token mới (mã hóa); doanh thu cộng chung với Shopify cùng tiền tệ; bị thu hồi → cần kết nối lại', async () => {
    const s = await setup();
    await saveStoreConnection(s.ctx, shop(s.client.id), KEYS);
    const { id } = await saveStoreConnection(
      s.ctx,
      {
        ...shop(s.client.id),
        provider: 'shopee',
        externalId: '123456',
        name: 'Shopee Sao Mai',
        token: 'shopee_refresh_goc',
      },
      KEYS,
    );
    const deps = { shopify: new MockShopify(), shopee: new MockShopee(), keys: KEYS.keys, clock };
    const cipher = async () =>
      (await db.select().from(schema.storeConnections).where(eq(schema.storeConnections.id, id)))[0]!.tokenCiphertext!;
    const before = await cipher();
    for (const c of await listStoreConnections(s.wctx)) {
      expect((await runStoreSync(s.wctx, { connectionId: c.id, days: 30 }, deps)).status).toBe('ok');
    }
    const after = await cipher();
    expect(after.equals(before)).toBe(false);
    expect(after.toString('utf8')).not.toContain('shopee_refresh');
    const sum = await storeSummary(s.wctx, [s.client.id], { from: '2026-10-22', to: '2026-10-24' });
    // Shopify 33 đơn / 14.850.000đ + Shopee (20 + ngày%3: 22, 20, 21 = 63 đơn × 150.000đ = 9.450.000đ).
    expect(sum).toMatchObject({ currency: 'VND', orders: 96, revenue: '24300000.0000' });

    await saveStoreConnection(
      s.ctx,
      { ...shop(s.client.id), provider: 'shopee', externalId: '123456', name: 'Shopee Sao Mai', token: 'revoked' },
      KEYS,
    );
    expect(await runStoreSync(s.wctx, { connectionId: id }, deps)).toEqual({
      status: 'failed',
      code: 'SHOPEE_HTTP_401',
    });
  });
});
