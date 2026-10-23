import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { HttpMetaWrite } from '@adxlens/meta-client/write';
import { MockMetaWrite } from '@adxlens/meta-client/write-mock';
import { breakerOpen, cancelPending, createMetaWriter, killSwitchState, recordFailure, recordSuccess } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id);
  const ctx = { db, workspaceId: workspace.id };
  const action = async (status: 'pending' | 'success' = 'pending') =>
    (
      await db
        .insert(schema.actions)
        .values({
          workspaceId: workspace.id,
          adAccountId: acc.id,
          actionType: 'pause_ad',
          targetType: 'ad',
          targetMetaId: '1',
          tier: 'approve',
          params: {},
          beforeState: { status: 'ACTIVE' },
          afterExpected: { status: 'PAUSED' },
          status,
          idempotencyKey: `k-${Math.random()}`,
        })
        .returning()
    )[0]!;
  return { ctx, acc, action, workspaceId: workspace.id };
}

describe('kill switch, circuit breaker, hủy hành động đang chờ', () => {
  it('hủy mọi hành động pending (giữ nguyên hành động đã xong), ghi nhật ký', async () => {
    const s = await setup();
    const p = await s.action();
    const done = await s.action('success');
    expect(await cancelPending(s.ctx, 'kill_switch')).toBe(1);
    const rows = await db.select().from(schema.actions).where(eq(schema.actions.workspaceId, s.workspaceId));
    expect(rows.find((r) => r.id === p.id)).toMatchObject({ status: 'canceled', resultCode: 'kill_switch' });
    expect(rows.find((r) => r.id === done.id)!.status).toBe('success');
    const logs = await db.select().from(schema.actionLogs).where(eq(schema.actionLogs.actionId, p.id));
    expect(logs.map((l) => l.event)).toEqual(['canceled']);
    const other = await setup();
    await other.action();
    expect(await cancelPending(s.ctx, 'x')).toBe(0); // không chạm workspace khác
  });

  it('breaker: mở ở ngưỡng, thành công đặt lại bộ đếm; kill switch đọc đúng phạm vi', async () => {
    const s = await setup();
    expect(await recordFailure(s.ctx, s.acc.id, 2)).toBe(false);
    await recordSuccess(s.ctx, s.acc.id);
    expect(await recordFailure(s.ctx, s.acc.id, 2)).toBe(false);
    expect(await recordFailure(s.ctx, s.acc.id, 2)).toBe(true);
    expect(await breakerOpen(s.ctx, s.acc.id)).toBe(true);
    expect(await recordFailure(s.ctx, s.acc.id, 2)).toBe(false); // đã mở, không "mở lại"
    const other = await setup();
    await db
      .insert(schema.killSwitches)
      .values({ scopeKey: other.workspaceId, workspaceId: other.workspaceId, active: true });
    expect(await killSwitchState(s.ctx)).toEqual({ global: false, workspace: false });
    expect(await killSwitchState(other.ctx)).toEqual({ global: false, workspace: true });
  });

  it('lớp ghi: mock dùng chung một bản; thật là HttpMetaWrite', () => {
    const m = createMetaWriter({ mock: true, apiVersion: 'v24.0' });
    expect(m).toBeInstanceOf(MockMetaWrite);
    expect(createMetaWriter({ mock: true, apiVersion: 'v24.0' })).toBe(m);
    expect(createMetaWriter({ mock: false, apiVersion: 'v24.0', appSecret: 's' })).toBeInstanceOf(HttpMetaWrite);
  });
});

describe('test tích hợp lớp ghi (self-test, ADR-0008 mục 9)', () => {
  it('chạy đủ mọi action_type trên tài khoản cho phép, trả lại trạng thái gốc', async () => {
    const { mockWriteState, MockMetaRead } = await import('@adxlens/meta-client/mock');
    const { runWriteSelfTest } = await import('./index');
    mockWriteState.reset();
    const read = new MockMetaRead(() => new Date('2026-10-23T03:00:00Z'));
    const [ad] = await read.listAds('', 'act_100000001');
    const adset = (await read.listAdSets('', 'act_100000001')).find((x) => x.daily_budget)!;
    const w = new MockMetaWrite();
    const steps = await runWriteSelfTest(w, 't', {
      allowedAccounts: ['act_100000001'],
      adId: ad!.id,
      adsetId: adset.id,
    });
    expect(steps.every((s) => s.ok)).toBe(true);
    expect(steps.map((s) => s.action)).toContain('duplicate_adset');
    expect((await w.getObject('', ad!.id, 'ad')).status).toBe('ACTIVE');
    expect((await w.getObject('', adset.id, 'adset')).daily_budget).toBe(adset.daily_budget);
  });

  it('đối tượng ngoài danh sách tài khoản test, hoặc thiếu danh sách → không ghi gì', async () => {
    const { MockMetaRead } = await import('@adxlens/meta-client/mock');
    const { runWriteSelfTest } = await import('./index');
    const read = new MockMetaRead(() => new Date('2026-10-23T03:00:00Z'));
    const [ad] = await read.listAds('', 'act_100000002');
    const [adset] = await read.listAdSets('', 'act_100000002');
    const w = new MockMetaWrite();
    await expect(
      runWriteSelfTest(w, 't', { allowedAccounts: ['act_100000001'], adId: ad!.id, adsetId: adset!.id }),
    ).rejects.toThrow();
    await expect(runWriteSelfTest(w, 't', { allowedAccounts: [], adId: ad!.id, adsetId: adset!.id })).rejects.toThrow();
    expect(w.calls).toEqual([]);
  });
});
