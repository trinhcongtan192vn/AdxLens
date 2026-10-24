import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import {
  assignAdAccount,
  disconnectConnection,
  importAccounts,
  keysFromEnv,
  saveConnection,
  unassignAdAccount,
} from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { findShareByToken } from '@adxlens/core/ops';
import { reconcileAccount } from '@adxlens/core/reconciliation';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  buildReport,
  createReport,
  createShareLink,
  hashSharePassword,
  listShareLinks,
  publicShareState,
  recordShareView,
  revokeShareLink,
  verifySharePassword,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 12).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };
const later = (days: number) => ({ now: () => new Date(now().getTime() + days * 86_400_000) });
const meta = new MockMetaRead(now);

/** Lỗi trigger DB: drizzle bọc lỗi Postgres trong `cause`. */
async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'không lỗi';
  } catch (e) {
    return `${(e as Error).message} ${(e as { cause?: Error }).cause?.message ?? ''}`;
  }
}

async function readyReport() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-sh', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'sh' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, { meta, keys: KEYS.keys, clock });
  await reconcileAccount(
    ctx,
    { adAccountId: a!.adAccountId, from: '2026-10-16', to: '2026-10-22' },
    { meta, keys: KEYS.keys, clock },
  );
  const { clientId } = await assignAdAccount(ctx, a!.adAccountId, { createClientName: 'Linh' });
  const { id } = await createReport(
    ctx,
    { clientId: clientId!, kind: 'periodic', from: '2026-10-16', to: '2026-10-22' },
    { enqueue },
  );
  await buildReport({ ...ctx, actor: SYSTEM_ACTOR }, id, clock);
  return { ctx, reportId: id, adAccountId: a!.adAccountId, connectionId, ws: workspace.id };
}

describe('link chia sẻ (R04, P0-14)', () => {
  it('tạo link: token 32 byte base64url, hạn tùy chọn, mật khẩu băm; tra theo token', async () => {
    const { ctx, reportId } = await readyReport();
    const link = await createShareLink(ctx, reportId, { expiresInDays: 7, password: 'mat-khau' }, clock);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link.expiresAt).toEqual(later(7).now());
    expect(link.passwordHash).toMatch(/^scrypt\$/);
    expect(link.passwordHash).not.toContain('mat-khau');
    expect(verifySharePassword('mat-khau', link.passwordHash!)).toBe(true);
    expect(verifySharePassword('sai', link.passwordHash!)).toBe(false);
    expect((await findShareByToken(db, link.token))!.id).toBe(link.id);
    expect(await findShareByToken(db, 'abc')).toBeNull();
    expect(await listShareLinks(ctx, reportId)).toHaveLength(1);
  });

  it('chưa xác nhận gán → 422 REPORT_BLOCKED; trigger DB chặn cả khi ghi thẳng', async () => {
    const { ctx, reportId, adAccountId, ws } = await readyReport();
    await unassignAdAccount(ctx, adAccountId);
    await db
      .update(schema.adAccounts)
      .set({ clientId: (await db.select().from(schema.clients))[0]!.id })
      .where(eq(schema.adAccounts.id, adAccountId));
    await expect(createShareLink(ctx, reportId, {}, clock)).rejects.toMatchObject({ code: 'REPORT_BLOCKED' });
    expect(
      await dbError(
        db
          .insert(schema.shareLinks)
          .values({ workspaceId: ws, reportId, token: 'x'.repeat(43), createdBy: ctx.actor.userId }),
      ),
    ).toMatch(/REPORT_BLOCKED: unconfirmed assignment/);
  });

  it('ngày lệch trong kỳ → bị chặn (API và trigger)', async () => {
    const { ctx, reportId, adAccountId, ws } = await readyReport();
    await db
      .update(schema.reconciliationResults)
      .set({ status: 'warning' })
      .where(eq(schema.reconciliationResults.date, '2026-10-20'));
    await expect(createShareLink(ctx, reportId, {}, clock)).rejects.toMatchObject({
      code: 'REPORT_BLOCKED',
      details: { warning_dates: [{ adAccountId, dates: ['2026-10-20'] }] },
    });
    expect(
      await dbError(
        db
          .insert(schema.shareLinks)
          .values({ workspaceId: ws, reportId, token: 'y'.repeat(43), createdBy: ctx.actor.userId }),
      ),
    ).toMatch(/REPORT_BLOCKED: reconciliation warning/);
  });
});

describe('trang công khai (R06)', () => {
  it('xem được → đếm lượt xem; cần mật khẩu; hết hạn; thu hồi', async () => {
    const { ctx, reportId } = await readyReport();
    const open = await createShareLink(ctx, reportId, {}, clock);
    const st = await publicShareState(ctx, open, { unlocked: false, clock });
    expect(st).toMatchObject({ state: 'ok', reportId, showBadge: true });
    await recordShareView(ctx, open.id, clock);
    await recordShareView(ctx, open.id, clock);
    expect((await findShareByToken(db, open.token))!.viewCount).toBe(2);
    // P0-25: lần mở đầu tiên báo người tạo link (một lần).
    const viewed = await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'report_viewed'));
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({ userId: ctx.actor.userId, params: { client: 'Linh' } });

    const locked = await createShareLink(ctx, reportId, { password: 'mat-khau' }, clock);
    expect((await publicShareState(ctx, locked, { unlocked: false, clock })).state).toBe('password');
    expect((await publicShareState(ctx, locked, { unlocked: true, clock })).state).toBe('ok');

    const short = await createShareLink(ctx, reportId, { expiresInDays: 7 }, clock);
    expect((await publicShareState(ctx, short, { unlocked: false, clock: later(8) })).state).toBe('expired');

    await revokeShareLink(ctx, open.id, clock);
    const revoked = (await findShareByToken(db, open.token))!;
    expect((await publicShareState(ctx, revoked, { unlocked: false, clock })).state).toBe('revoked');
  });

  it('sau khi tạo link: đối chiếu lệch hoặc ngắt kết nối → link bị khóa (P0-22, P0-23)', async () => {
    const { ctx, reportId, connectionId } = await readyReport();
    const link = await createShareLink(ctx, reportId, {}, clock);
    await db
      .update(schema.reconciliationResults)
      .set({ status: 'warning' })
      .where(eq(schema.reconciliationResults.date, '2026-10-20'));
    expect((await publicShareState(ctx, link, { unlocked: false, clock })).state).toBe('locked');
    await db.update(schema.reconciliationResults).set({ status: 'ok' });
    expect((await publicShareState(ctx, link, { unlocked: false, clock })).state).toBe('ok');
    await disconnectConnection(ctx, connectionId, { enqueue: recordingEnqueue(), clock });
    expect((await publicShareState(ctx, link, { unlocked: false, clock })).state).toBe('locked');
  });

  it('gỡ nhãn ở workspace → link mới không có nhãn Powered by', async () => {
    const { ctx, reportId, ws } = await readyReport();
    await db.update(schema.workspaces).set({ badgeRemoved: true }).where(eq(schema.workspaces.id, ws));
    expect((await createShareLink(ctx, reportId, {}, clock)).showBadge).toBe(false);
  });

  it('băm mật khẩu khác nhau mỗi lần (muối ngẫu nhiên)', () => {
    expect(hashSharePassword('abc123')).not.toBe(hashSharePassword('abc123'));
  });
});
