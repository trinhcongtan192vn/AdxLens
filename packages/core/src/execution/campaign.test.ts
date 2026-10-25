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
import {
  executeAction,
  GUARDRAIL_DEFAULTS,
  previewAction,
  requestAction,
  requestAutoAction,
  saveGuardrails,
  undoAction,
} from './index';

const db = testDb();
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 14).toString('base64') });
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
      token: 'mock-write-camp',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `c-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client C' }).returning();
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
      reason: 'test campaign',
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
  return {
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

describe('tạm dừng / bật lại chiến dịch (ADR-0015)', () => {
  it('tạm dừng chiến dịch → xác minh → hoàn tác bật lại; đã ở trạng thái đích → không gọi Meta', async () => {
    const s = await setup();
    const req = { adAccountId: s.adAccountId, actionType: 'pause_campaign' as const, targetMetaId: s.campaignId };
    const p = await previewAction(s.ctx, req, clock);
    expect(p).toMatchObject({
      targetType: 'campaign',
      before: { status: 'ACTIVE' },
      after: { status: 'PAUSED' },
      undoable: true,
    });
    const a = await requestAction(s.ctx, req, { enqueue: s.enqueue, clock });
    expect(a).toMatchObject({ targetType: 'campaign', tier: 'approve' });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(mockWriteState.overrides.get(s.campaignId)).toMatchObject({ status: 'PAUSED' });
    const u = await undoAction(s.ctx, a.id, { enqueue: s.enqueue, clock });
    expect(u).toMatchObject({ actionType: 'resume_campaign', undoOf: a.id });
    expect(await s.run(u.id)).toEqual({ status: 'success', resultCode: 'ok' });
    // Đã ACTIVE trên Meta nhưng bản chụp cũ: không gọi Meta lần nữa.
    const again = await requestAction(s.ctx, { ...req, actionType: 'resume_campaign' }, { enqueue: s.enqueue, clock });
    expect(await s.run(again.id)).toEqual({ status: 'success', resultCode: 'no_change' });
  });

  it('cờ tắt → từ chối; chiến dịch bị loại trừ → vi phạm guardrails; rule tự động không được thao tác chiến dịch', async () => {
    const s = await setup();
    const req = { adAccountId: s.adAccountId, actionType: 'pause_campaign' as const, targetMetaId: s.campaignId };
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [s.campaignId] });
    expect((await previewAction(s.ctx, req, clock)).violations.map((v) => v.code)).toContain('excluded');
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] });
    await enableFlag(db, {
      workspaceId: s.workspaceId,
      key: 'p2b_auto',
      staffUserId: s.pm.id,
      reason: 'thử auto',
      override: true,
    });
    const auto = await requestAutoAction(
      s.wctx,
      { ruleId: s.workspaceId, adAccountId: s.adAccountId, actionType: 'pause_campaign', targetMetaId: s.campaignId },
      { enqueue: s.enqueue, clock },
    );
    expect('skipped' in auto && auto.skipped).toContain('no_auto_campaign');
    await disableFlag(db, { workspaceId: s.workspaceId, key: 'p2a_approve', staffUserId: s.pm.id, reason: 'tắt thử' });
    await expect(requestAction(s.ctx, req, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
