import { sql } from 'drizzle-orm';
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
import { enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { executeAction, previewAction, requestAction, requestAutoAction, undoAction } from './index';

const db = testDb();
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 16).toString('base64') });
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
      token: 'mock-write-bid',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `b-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client B' }).returning();
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
      reason: 'test bid',
      override: true,
    });
  }
  await setSubscription(ctx, { planKey: 'growth' });
  const wctx = { db, workspaceId: workspace.id };
  const run = (actionId: string) => executeAction(wctx, actionId, { writer, keys: KEYS.keys, clock, enqueue });
  const pick = async (type: 'adset' | 'campaign', where: ReturnType<typeof sql>) => {
    const [r] = await db.execute<{ meta_id: string }>(sql`
      select meta_id from analytics.entities where ad_account_id = ${adAccountId} and entity_type = ${type} and ${where}
      order by meta_id limit 1`);
    return r!.meta_id;
  };
  const bidAdset = await pick('adset', sql`attrs->>'bid_amount' is not null`);
  const noBidAdset = await pick('adset', sql`attrs->>'bid_amount' is null`);
  const capCampaign = await pick('campaign', sql`attrs->>'spend_cap' is not null`);
  const noCapCampaign = await pick('campaign', sql`attrs->>'spend_cap' is null`);
  return {
    bidAdset,
    noBidAdset,
    capCampaign,
    noCapCampaign,
    ctx,
    wctx,
    workspaceId: workspace.id,
    clientId: client!.id,
    adAccountId,
    enqueue,
    run,
    pm,
  };
}

describe('giá thầu nhóm QC và giới hạn chi chiến dịch (ADR-0025)', () => {
  it('giá thầu ±10%: ghi một lần, xác minh, cập nhật bản chụp, hoàn tác về giá cũ', async () => {
    const s = await setup();
    const req = {
      adAccountId: s.adAccountId,
      actionType: 'set_adset_bid' as const,
      targetMetaId: s.bidAdset,
      newValue: '44000',
    };
    const p = await previewAction(s.ctx, req, clock);
    expect(p).toMatchObject({ before: { bid_amount: '40000' }, after: { bid_amount: '44000' }, violations: [] });
    const a = await requestAction(s.ctx, req, { enqueue: s.enqueue, clock });
    expect(a.params).toEqual({ bid_amount: '44000' });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(writer.calls).toEqual([{ op: 'setBidAmount', id: s.bidAdset, value: '44000' }]);
    const [e] = await db.execute<{ v: string }>(
      sql`select attrs->>'bid_amount' as v from analytics.entities where meta_id = ${s.bidAdset}`,
    );
    expect(e!.v).toBe('44000');
    const u = await undoAction(s.ctx, a.id, { enqueue: s.enqueue, clock });
    expect(u).toMatchObject({ actionType: 'set_adset_bid', afterExpected: { bid_amount: '40000' } });
    expect(await s.run(u.id)).toEqual({ status: 'success', resultCode: 'ok' });
  });

  it('giá thầu +20% bị chặn; nhóm QC không có giá thầu (chiến lược tự động) bị chặn; trùng giá → từ chối', async () => {
    const s = await setup();
    const base = { adAccountId: s.adAccountId, actionType: 'set_adset_bid' as const };
    const codes = async (targetMetaId: string, newValue: string) =>
      (await previewAction(s.ctx, { ...base, targetMetaId, newValue }, clock)).violations.map((v) => v.code);
    expect(await codes(s.bidAdset, '48000')).toContain('bid_change_too_large');
    expect(await codes(s.noBidAdset, '40000')).toContain('no_bid_amount');
    await expect(
      requestAction(s.ctx, { ...base, targetMetaId: s.bidAdset, newValue: '48000' }, { enqueue: s.enqueue, clock }),
    ).rejects.toMatchObject({
      code: 'GUARDRAIL_VIOLATION',
    });
    await expect(
      previewAction(s.ctx, { ...base, targetMetaId: s.bidAdset, newValue: '40000' }, clock),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('giới hạn chi: hạ bao nhiêu cũng được; nâng > 15% bị chặn; đặt mới cho chiến dịch chưa có → không hoàn tác được', async () => {
    const s = await setup();
    const base = { adAccountId: s.adAccountId, actionType: 'set_campaign_spend_cap' as const };
    const codes = async (targetMetaId: string, newValue: string) =>
      (await previewAction(s.ctx, { ...base, targetMetaId, newValue }, clock)).violations.map((v) => v.code);
    expect(await codes(s.capCampaign, '10000000')).toEqual([]);
    expect(await codes(s.capCampaign, '66000000')).toEqual([]);
    expect(await codes(s.capCampaign, '70000000')).toContain('spend_cap_change_too_large');
    expect(await codes(s.capCampaign, '0')).toContain('invalid_spend_cap');

    const lower = await requestAction(
      s.ctx,
      { ...base, targetMetaId: s.capCampaign, newValue: '55000000' },
      { enqueue: s.enqueue, clock },
    );
    expect(await s.run(lower.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(mockWriteState.overrides.get(s.capCampaign)).toMatchObject({ spend_cap: '55000000' });
    const undo = await undoAction(s.ctx, lower.id, { enqueue: s.enqueue, clock });
    expect(undo.afterExpected).toEqual({ spend_cap: '60000000' });
    expect(await s.run(undo.id)).toEqual({ status: 'success', resultCode: 'ok' });
    // Hạ mạnh rồi hoàn tác = nâng > 15% → guardrail chặn hoàn tác (không nới, như ngân sách).
    const deep = await requestAction(
      s.ctx,
      { ...base, targetMetaId: s.capCampaign, newValue: '30000000' },
      { enqueue: s.enqueue, clock },
    );
    expect(await s.run(deep.id)).toEqual({ status: 'success', resultCode: 'ok' });
    await expect(undoAction(s.ctx, deep.id, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'GUARDRAIL_VIOLATION',
    });

    const fresh = await requestAction(
      s.ctx,
      { ...base, targetMetaId: s.noCapCampaign, newValue: '5000000' },
      { enqueue: s.enqueue, clock },
    );
    expect(fresh.beforeState).toEqual({ spend_cap: null });
    expect(await s.run(fresh.id)).toEqual({ status: 'success', resultCode: 'ok' });
    await expect(undoAction(s.ctx, fresh.id, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('giá trên Meta đã đổi sau khi duyệt → không ghi đè; rule tự động không bao giờ đổi giá thầu / giới hạn chi', async () => {
    const s = await setup();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'set_adset_bid', targetMetaId: s.bidAdset, newValue: '42000' },
      { enqueue: s.enqueue, clock },
    );
    mockWriteState.overrides.set(s.bidAdset, { bid_amount: '39000' });
    expect(await s.run(a.id)).toMatchObject({ status: 'failed', resultCode: 'state_changed' });
    expect(writer.calls).toEqual([]);
    await enableFlag(db, {
      workspaceId: s.workspaceId,
      key: 'p2b_auto',
      staffUserId: s.pm.id,
      reason: 'thử auto',
      override: true,
    });
    for (const [actionType, targetMetaId] of [
      ['set_adset_bid', s.bidAdset],
      ['set_campaign_spend_cap', s.capCampaign],
    ] as const) {
      const auto = await requestAutoAction(
        s.wctx,
        { ruleId: s.workspaceId, adAccountId: s.adAccountId, actionType, targetMetaId },
        { enqueue: s.enqueue, clock },
      );
      expect('skipped' in auto && auto.skipped).toContain('no_auto_edit');
    }
  });
});
