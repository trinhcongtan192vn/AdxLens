import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { memoryEmailSender } from '@adxlens/core/notification';
import { deletionStatusByCode, handleMetaDataDeletion } from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  disconnectConnection,
  importAccounts,
  keysFromEnv,
  listDeletionRequests,
  parseSignedRequest,
  PURGE_DELAY_DAYS,
  purgeConnectionData,
  saveConnection,
  signRequest,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 4).toString('base64') });
const T0 = new Date('2026-10-23T03:00:00Z');
const later = (days: number) => ({ now: () => new Date(T0.getTime() + days * 86_400_000) });

async function connectedWithData(metaUserId = 'meta-del') {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = {
    token: 'mock-read-del',
    expiresAt: null,
    scopes: ['ads_read'],
    metaUser: { id: metaUserId },
    accounts: MOCK_ACCOUNTS,
  };
  const { connectionId } = await saveConnection(ctx, conn, KEYS);
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock: later(0) });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, {
    meta: new MockMetaRead(() => T0),
    keys: KEYS.keys,
    clock: later(0),
  });
  return { ctx, connectionId, owner, conn };
}

const count = async (table: string) =>
  (await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${table}`)))[0]!.n;

describe('ngắt kết nối và xóa dữ liệu (S07, P0-22)', () => {
  it('xóa token ngay, hẹn purge 7 ngày, email xác nhận; purge xóa mọi dữ liệu quảng cáo', async () => {
    const { ctx, connectionId, owner } = await connectedWithData();
    expect(await count('analytics.insights_daily')).toBeGreaterThan(0);
    const enqueue = recordingEnqueue();
    const email = memoryEmailSender();
    const r = await disconnectConnection(ctx, connectionId, { enqueue, email, appUrl: 'http://app', clock: later(0) });
    expect(r.code).toMatch(/^XD-[A-Z0-9]{8}$/);

    const [c] = await db.select().from(schema.metaConnections).where(eq(schema.metaConnections.id, connectionId));
    expect(c!.status).toBe('revoked');
    expect(c!.tokenCiphertext.length).toBe(0);
    expect(enqueue.calls).toEqual([
      {
        name: 'maintenance:purge_connection_data',
        payload: { workspaceId: ctx.workspaceId, connectionId },
        opts: { delayMs: PURGE_DELAY_DAYS * 86_400_000 },
      },
    ]);
    expect(email.sent[0]).toMatchObject({ to: owner.email });
    expect(email.sent[0]!.text).toContain(r.code);
    expect((await deletionStatusByCode(db, r.code))!.status).toBe('pending');

    // Chạy sớm hơn hạn → không xóa.
    expect(await purgeConnectionData(ctx, connectionId, { clock: later(3) })).toBe('not_due');
    expect(await count('analytics.insights_daily')).toBeGreaterThan(0);

    expect(await purgeConnectionData(ctx, connectionId, { email, appUrl: 'http://app', clock: later(7) })).toBe('done');
    for (const t of [
      'app.meta_connections',
      'app.ad_accounts',
      'app.meta_available_accounts',
      'app.sync_runs',
      'analytics.insights_daily',
      'analytics.entities',
    ]) {
      expect(await count(t), t).toBe(0);
    }
    expect((await deletionStatusByCode(db, r.code.toLowerCase()))!.status).toBe('done');
    expect(email.sent.at(-1)!.subject).toContain('Đã xóa dữ liệu');
    expect((await listDeletionRequests(ctx))[0]).toMatchObject({ status: 'done' });
  });

  it('kết nối lại trước hạn → hủy xóa, dữ liệu còn nguyên', async () => {
    const { ctx, connectionId, conn } = await connectedWithData();
    const r = await disconnectConnection(ctx, connectionId, { enqueue: recordingEnqueue(), clock: later(0) });
    await saveConnection(ctx, conn, KEYS);
    expect(await purgeConnectionData(ctx, connectionId, { clock: later(7) })).toBe('cancelled');
    expect(await count('analytics.insights_daily')).toBeGreaterThan(0);
    expect((await deletionStatusByCode(db, r.code))!.status).toBe('cancelled');
  });

  it('gọi lại khi đang chờ → trả cùng mã; buyer không ngắt được; không chạm workspace khác', async () => {
    const { ctx, connectionId } = await connectedWithData();
    const enqueue = recordingEnqueue();
    const a = await disconnectConnection(ctx, connectionId, { enqueue, clock: later(0) });
    const b = await disconnectConnection(ctx, connectionId, { enqueue, clock: later(0) });
    expect(b).toMatchObject({ code: a.code, created: false });
    const buyer = await seedMember(db, ctx.workspaceId, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, ctx.workspaceId, buyer.id))! };
    await expect(disconnectConnection(bctx, connectionId, { enqueue })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const other = await seedWorkspace(db);
    const octx = {
      db,
      workspaceId: other.workspace.id,
      actor: (await resolveActor(db, other.workspace.id, other.owner.id))!,
    };
    await expect(disconnectConnection(octx, connectionId, { enqueue })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('data deletion callback của Meta', () => {
  it('chữ ký đúng → thu hồi mọi kết nối của người dùng Meta ở mọi workspace, chung một mã', async () => {
    const a = await connectedWithData('meta-shared');
    const b = await connectedWithData('meta-shared');
    const c = await connectedWithData('meta-other');
    const sr = signRequest({ algorithm: 'HMAC-SHA256', user_id: 'meta-shared', issued_at: 1 }, 'app-secret');
    expect(parseSignedRequest(sr, 'app-secret')).toEqual({ userId: 'meta-shared' });
    const r = await handleMetaDataDeletion(db, 'meta-shared', { enqueue: recordingEnqueue(), clock: later(0) });
    expect(r.connections).toBe(2);
    const st = await db.select().from(schema.metaConnections);
    const byId = Object.fromEntries(st.map((x) => [x.id, x.status]));
    expect(byId[a.connectionId]).toBe('revoked');
    expect(byId[b.connectionId]).toBe('revoked');
    expect(byId[c.connectionId]).toBe('active');
    expect((await deletionStatusByCode(db, r.code))!.status).toBe('pending');
  });

  it('chữ ký sai hoặc payload hỏng → từ chối', () => {
    const sr = signRequest({ algorithm: 'HMAC-SHA256', user_id: 'x' }, 'app-secret');
    expect(() => parseSignedRequest(sr, 'wrong-secret')).toThrow();
    expect(() => parseSignedRequest('abc', 'app-secret')).toThrow();
    expect(() => parseSignedRequest(signRequest({ algorithm: 'NONE', user_id: 'x' }, 's'), 's')).toThrow();
  });

  it('mã không tồn tại / sai định dạng → null', async () => {
    expect(await deletionStatusByCode(db, 'XD-ZZZZZZZZ')).toBeNull();
    expect(await deletionStatusByCode(db, 'nope')).toBeNull();
  });
});
