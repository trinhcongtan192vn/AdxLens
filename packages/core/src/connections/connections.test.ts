import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedClient, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { resolveActor } from '@adxlens/core/tenancy';
import { decryptToken, encryptToken } from './crypto';
import {
  connectionHealth,
  importAccounts,
  keysFromEnv,
  listAdAccounts,
  listAvailableAccounts,
  listConnections,
  saveConnection,
  suggestClient,
  withConnectionToken,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 7).toString('base64') });
const TOKEN = 'EAAGm0PX4ZCpsBAKZCZBZCZCxyzPLAINTOKEN';

async function ownerCtx() {
  const { workspace, owner } = await seedWorkspace(db);
  return { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
}

const input = {
  token: TOKEN,
  expiresAt: new Date(Date.now() + 60 * 86_400_000),
  scopes: ['ads_read', 'business_management'],
  metaUser: { id: 'meta-u1', name: 'Hà Nguyễn' },
  accounts: MOCK_ACCOUNTS,
};

describe('mã hóa token (L3 5.4)', () => {
  it('AES-256-GCM: giải mã đúng, sửa 1 byte thì thất bại, mỗi lần mã hóa khác nhau', () => {
    const key = KEYS.keys[1]!;
    const a = encryptToken(TOKEN, key);
    const b = encryptToken(TOKEN, key);
    expect(a.equals(b)).toBe(false);
    expect(decryptToken(a, key)).toBe(TOKEN);
    const tampered = Buffer.from(a);
    tampered[30] = tampered[30]! ^ 1;
    expect(() => decryptToken(tampered, key)).toThrow();
  });

  it('khóa sai không giải mã được', () => {
    const blob = encryptToken(TOKEN, KEYS.keys[1]!);
    expect(() => decryptToken(blob, Buffer.alloc(32, 9))).toThrow();
  });
});

describe('kết nối Meta', () => {
  it('DB chỉ lưu ciphertext; danh sách kết nối không trả token', async () => {
    const ctx = await ownerCtx();
    await saveConnection(ctx, input, KEYS);
    const raw = await db.execute(sql`select token_ciphertext::text as t from app.meta_connections`);
    expect(JSON.stringify(raw)).not.toContain(TOKEN);
    expect(JSON.stringify(raw)).not.toContain(Buffer.from(TOKEN).toString('hex'));
    const list = await listConnections(ctx);
    expect(JSON.stringify(list)).not.toContain(TOKEN);
    expect(list[0]).not.toHaveProperty('tokenCiphertext');
  });

  it('kết nối lại cùng tài khoản Meta cập nhật kết nối cũ', async () => {
    const ctx = await ownerCtx();
    const a = await saveConnection(ctx, input, KEYS);
    const b = await saveConnection(ctx, { ...input, token: 'EAAnewtoken0000000000000000' }, KEYS);
    expect(b).toEqual({ connectionId: a.connectionId, reconnected: true });
    expect(await listConnections(ctx)).toHaveLength(1);
  });

  it('withConnectionToken giải mã đúng; kết nối hết hạn bị từ chối', async () => {
    const ctx = await ownerCtx();
    const { connectionId } = await saveConnection(ctx, input, KEYS);
    expect(await withConnectionToken(ctx, connectionId, KEYS.keys, async (t) => t)).toBe(TOKEN);
    await db.execute(sql`update app.meta_connections set status = 'expired'`);
    await expect(withConnectionToken(ctx, connectionId, KEYS.keys, async (t) => t)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('không dùng được token của workspace khác', async () => {
    const a = await ownerCtx();
    const b = await ownerCtx();
    const { connectionId } = await saveConnection(a, input, KEYS);
    await expect(withConnectionToken(b, connectionId, KEYS.keys, async (t) => t)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('buyer không quản lý được kết nối', async () => {
    const ctx = await ownerCtx();
    const buyer = await seedMember(db, ctx.workspaceId, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, ctx.workspaceId, buyer.id))! };
    await expect(saveConnection(bctx, input, KEYS)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('nhập tài khoản QC (S04, L3 10.2)', () => {
  it('gợi ý Client theo tên, trạng thái gán "suggested", đánh dấu đã nhập', async () => {
    const ctx = await ownerCtx();
    const client = await seedClient(db, ctx.workspaceId, 'Cà phê Nhà Rang');
    const { connectionId } = await saveConnection(ctx, input, KEYS);
    const items = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001', 'act_100000002'] });
    expect(items).toEqual([
      expect.objectContaining({
        metaAccountId: 'act_100000001',
        suggestedClient: { id: client.id, name: client.name },
        assignmentStatus: 'suggested',
      }),
      expect.objectContaining({
        metaAccountId: 'act_100000002',
        suggestedClient: { id: null, name: 'Thời trang Linh' },
      }),
    ]);
    const avail = await listAvailableAccounts(ctx, connectionId);
    expect(avail.filter((a) => a.imported).map((a) => a.metaAccountId)).toEqual(['act_100000001', 'act_100000002']);
  });

  it('không nhập tài khoản không thuộc kết nối', async () => {
    const ctx = await ownerCtx();
    const { connectionId } = await saveConnection(ctx, input, KEYS);
    await expect(importAccounts(ctx, { connectionId, metaAccountIds: ['act_999'] })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('buyer chỉ thấy tài khoản của Client được gán', async () => {
    const ctx = await ownerCtx();
    const c1 = await seedClient(db, ctx.workspaceId, 'Cà phê Nhà Rang');
    const { connectionId } = await saveConnection(ctx, input, KEYS);
    await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001', 'act_100000002'] });
    const buyer = await seedMember(db, ctx.workspaceId, 'buyer', [c1.id]);
    const bctx = { ...ctx, actor: (await resolveActor(db, ctx.workspaceId, buyer.id))! };
    expect((await listAdAccounts(bctx)).map((a) => a.metaAccountId)).toEqual(['act_100000001']);
  });
});

describe('sức khỏe token', () => {
  it('phát hiện token hết hạn và sắp hết hạn trong 7 ngày', async () => {
    const ctx = await ownerCtx();
    await saveConnection(ctx, { ...input, expiresAt: new Date(Date.now() + 3 * 86_400_000) }, KEYS);
    const h = await connectionHealth(ctx);
    expect(h.expiringSoon).toHaveLength(1);
    await db.execute(sql`update app.meta_connections set status = 'expired'`);
    expect((await connectionHealth(ctx)).expired).toHaveLength(1);
  });
});

it('suggestClient bỏ hậu tố tên tài khoản', () => {
  expect(suggestClient('ABC Shop - Main', [])).toEqual({ id: null, name: 'ABC Shop' });
  expect(suggestClient('abc shop - VN', [{ id: 'c1', name: 'ABC Shop' }])).toEqual({ id: 'c1', name: 'ABC Shop' });
});
