import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { mockWriteState, MockMetaRead, MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { MockMetaWrite } from '@adxlens/meta-client/write-mock';
import { setSubscription } from '@adxlens/core/billing';
import {
  assignAdAccount,
  importAccounts,
  keysFromEnv,
  saveConnection,
  setWriteEnabled,
} from '@adxlens/core/connections';
import { disableFlag, enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { executeAction, previewAction, requestAction, requestAutoAction, undoAction } from './index';

const db = testDb();
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 15).toString('base64') });
const NOW = new Date('2026-10-23T03:00:00Z');
const clock = { now: () => NOW };

let writer: MockMetaWrite;
beforeEach(async () => {
  await truncateAll(db);
  mockWriteState.reset();
  writer = new MockMetaWrite();
});

async function setup(opts: { write?: boolean } = {}) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-write-rename',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `r-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client R' }).returning();
  await assignAdAccount(ctx, adAccountId, { clientId: client!.id });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, {
    meta: new MockMetaRead(clock.now),
    keys: KEYS.keys,
    clock,
  });
  if (opts.write !== false) await setWriteEnabled(ctx, connectionId, true);
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, {
      workspaceId: workspace.id,
      key,
      staffUserId: pm.id,
      reason: 'test rename',
      override: true,
    });
  }
  await setSubscription(ctx, { planKey: 'growth' });
  const wctx = { db, workspaceId: workspace.id };
  const run = (actionId: string) => executeAction(wctx, actionId, { writer, keys: KEYS.keys, clock, enqueue });
  const [campaign] = await db
    .select({ metaId: schema.entities.metaId })
    .from(schema.entities)
    .where(and(eq(schema.entities.adAccountId, adAccountId), eq(schema.entities.entityType, 'campaign')))
    .orderBy(schema.entities.metaId)
    .limit(1);
  const [ad] = await db
    .select({ metaId: schema.entities.metaId, name: schema.entities.name })
    .from(schema.entities)
    .where(and(eq(schema.entities.adAccountId, adAccountId), eq(schema.entities.entityType, 'ad')))
    .orderBy(schema.entities.metaId)
    .limit(1);
  return {
    ad: ad!,
    ctx,
    wctx,
    workspaceId: workspace.id,
    clientId: client!.id,
    adAccountId,
    enqueue,
    run,
    pm,
    campaignId: campaign!.metaId,
  };
}

describe('đổi tên (ADR-0025)', () => {
  it('đổi tên ad: xem trước tên cũ → mới, ghi một lần, xác minh, cập nhật bản chụp; hoàn tác về tên cũ', async () => {
    const s = await setup();
    const req = {
      adAccountId: s.adAccountId,
      actionType: 'rename_ad' as const,
      targetMetaId: s.ad.metaId,
      newName: '  [Q4] Video mới  ',
    };
    const p = await previewAction(s.ctx, req, clock);
    expect(p).toMatchObject({
      targetType: 'ad',
      before: { name: s.ad.name },
      after: { name: '[Q4] Video mới' },
      undoable: true,
      violations: [],
    });
    const a = await requestAction(s.ctx, req, { enqueue: s.enqueue, clock });
    expect(a).toMatchObject({ tier: 'approve', params: { name: '[Q4] Video mới' } });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(writer.calls).toEqual([{ op: 'setName', id: s.ad.metaId, value: '[Q4] Video mới' }]);
    const [e] = await db
      .select({ name: schema.entities.name })
      .from(schema.entities)
      .where(and(eq(schema.entities.workspaceId, s.workspaceId), eq(schema.entities.metaId, s.ad.metaId)));
    expect(e!.name).toBe('[Q4] Video mới');

    const u = await undoAction(s.ctx, a.id, { enqueue: s.enqueue, clock });
    expect(u).toMatchObject({ actionType: 'rename_ad', undoOf: a.id, afterExpected: { name: s.ad.name } });
    expect(await s.run(u.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(mockWriteState.overrides.get(s.ad.metaId)).toMatchObject({ name: s.ad.name });
  });

  it('tên rỗng / quá dài / ký tự điều khiển / trùng tên hiện tại → từ chối', async () => {
    const s = await setup();
    const base = { adAccountId: s.adAccountId, actionType: 'rename_ad' as const, targetMetaId: s.ad.metaId };
    for (const newName of ['   ', 'x'.repeat(401), 'a\u0007b', s.ad.name!]) {
      await expect(previewAction(s.ctx, { ...base, newName }, clock)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    }
  });

  it('tên trên Meta đã bị đổi sau khi duyệt → không ghi đè (state_changed)', async () => {
    const s = await setup();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'rename_ad', targetMetaId: s.ad.metaId, newName: 'Tên AdxLens' },
      { enqueue: s.enqueue, clock },
    );
    mockWriteState.overrides.set(s.ad.metaId, { name: 'Ai đó đổi trên Meta' });
    expect(await s.run(a.id)).toMatchObject({ status: 'failed', resultCode: 'state_changed' });
    expect(writer.calls).toEqual([]);
  });

  it('rule tự động không bao giờ đổi tên; quyền ghi tắt → chặn; cờ tắt → không chạy', async () => {
    const s = await setup();
    await enableFlag(db, {
      workspaceId: s.workspaceId,
      key: 'p2b_auto',
      staffUserId: s.pm.id,
      reason: 'thử auto',
      override: true,
    });
    const auto = await requestAutoAction(
      s.wctx,
      { ruleId: s.workspaceId, adAccountId: s.adAccountId, actionType: 'rename_campaign', targetMetaId: s.campaignId },
      { enqueue: s.enqueue, clock },
    );
    expect('skipped' in auto && auto.skipped).toContain('no_auto_edit');
    const req = {
      adAccountId: s.adAccountId,
      actionType: 'rename_campaign' as const,
      targetMetaId: s.campaignId,
      newName: 'Chiến dịch Q4',
    };
    await disableFlag(db, { workspaceId: s.workspaceId, key: 'p2a_approve', staffUserId: s.pm.id, reason: 'tắt thử' });
    await expect(requestAction(s.ctx, req, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
