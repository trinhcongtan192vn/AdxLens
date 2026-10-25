import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { mockWriteState, MockMetaRead, MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { MockMetaWrite } from '@adxlens/meta-client/write-mock';
import { setSubscription } from '@adxlens/core/billing';
import {
  assignAdAccount,
  importAccounts,
  keysFromEnv,
  listAssets,
  refreshAssets,
  saveConnection,
  setWriteEnabled,
} from '@adxlens/core/connections';
import { disableFlag, enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { launcherSources } from '@adxlens/core/reporting';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  checkGuardrails,
  executeAction,
  GUARDRAIL_DEFAULTS,
  previewAction,
  requestAutoAction,
  requestLaunch,
  saveGuardrails,
} from './index';

const db = testDb();
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 13).toString('base64') });
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
      token: 'mock-write-launch',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `l-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client L' }).returning();
  await assignAdAccount(ctx, adAccountId, { clientId: client!.id });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, {
    meta: new MockMetaRead(clock.now),
    keys: KEYS.keys,
    clock,
  });
  // ADR-0024: kết nối có ads_management được ghi ngay; `write: false` = Owner đã tự tắt quyền ghi.
  await setWriteEnabled(ctx, connectionId, opts.write !== false);
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test launch', override: true });
  }
  await setSubscription(ctx, { planKey: 'growth' });
  const wctx = { db, workspaceId: workspace.id };
  const run = (actionId: string) => executeAction(wctx, actionId, { writer, keys: KEYS.keys, clock, enqueue });
  const sources = await launcherSources(ctx, adAccountId);
  const [creative] = await db
    .select({ metaId: schema.entities.metaId })
    .from(schema.entities)
    .where(and(eq(schema.entities.adAccountId, adAccountId), eq(schema.entities.entityType, 'creative')))
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
    sources,
    connectionId,
    creativeId: creative!.metaId,
  };
}

describe('Ad Launcher (ADR-0023)', () => {
  it('đồng bộ lưu custom audience làm nguồn; tạo quảng cáo từ creative có sẵn → PAUSED, xác minh, nhật ký', async () => {
    const s = await setup();
    expect(s.sources.adsets.length).toBeGreaterThan(0);
    expect(s.sources.audiences.map((a) => a.subtype)).toEqual(
      expect.arrayContaining(['LOOKALIKE', 'WEBSITE', 'CUSTOM']),
    );
    const adsetId = s.sources.adsets[0]!.metaId;
    const a = await requestLaunch(
      s.ctx,
      { kind: 'create_ad', adAccountId: s.adAccountId, adsetId, creativeId: s.creativeId, name: 'Thử AdxLens' },
      { enqueue: s.enqueue, clock },
    );
    expect(a).toMatchObject({
      actionType: 'create_ad',
      tier: 'approve',
      status: 'pending',
      targetType: 'adset',
      targetMetaId: adsetId,
      params: { creative_id: s.creativeId, name: 'Thử AdxLens' },
      afterExpected: { created_status: 'PAUSED' },
    });
    expect(s.enqueue.calls.at(-1)).toMatchObject({ name: 'execute:action', payload: { actionId: a.id } });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    const [row] = await db.select().from(schema.actions).where(eq(schema.actions.id, a.id));
    const createdId = row!.afterState!.created_id!;
    expect(row!.afterState).toMatchObject({ created_status: 'PAUSED' });
    expect(mockWriteState.createdAds.get(createdId)).toMatchObject({ adset_id: adsetId, status: 'PAUSED' });
    expect(writer.calls.filter((c) => c.op === 'createAd')).toHaveLength(1);
    const events = (await db.select().from(schema.actionLogs).where(eq(schema.actionLogs.actionId, a.id))).map(
      (l) => l.event,
    );
    expect(events).toEqual(expect.arrayContaining(['approved', 'meta_call', 'verify', 'success']));
  });

  it('nguồn sai (creative / nhóm QC lạ), buyer không được gán, nhóm QC bị loại trừ, cờ tắt → từ chối', async () => {
    const s = await setup();
    const adsetId = s.sources.adsets[0]!.metaId;
    const base = {
      kind: 'create_ad' as const,
      adAccountId: s.adAccountId,
      adsetId,
      creativeId: s.creativeId,
      name: 'X',
    };
    await expect(
      requestLaunch(s.ctx, { ...base, creativeId: '999' }, { enqueue: s.enqueue, clock }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      requestLaunch(s.ctx, { ...base, adsetId: '999' }, { enqueue: s.enqueue, clock }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(requestLaunch(s.ctx, { ...base, name: '  ' }, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const buyer = await seedMember(db, s.workspaceId, 'buyer', [s.clientId]);
    const bctx = { ...s.ctx, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    await expect(requestLaunch(bctx, base, { enqueue: s.enqueue, clock })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [adsetId] });
    await expect(requestLaunch(s.ctx, base, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'GUARDRAIL_VIOLATION',
    });
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] });
    await disableFlag(db, { workspaceId: s.workspaceId, key: 'p2a_approve', staffUserId: s.pm.id, reason: 'tắt thử' });
    await expect(requestLaunch(s.ctx, base, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });

  it('không bao giờ tự chạy: guardrail no_auto_create; rule / preview không tạo được; kết nối chưa có quyền ghi → chặn', async () => {
    expect(
      checkGuardrails({
        guardrails: { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] },
        actionType: 'create_ad',
        tier: 'auto',
        targetIds: [],
        accountTimezone: 'Asia/Ho_Chi_Minh',
        now: NOW,
        actionsToday: 0,
        dataDays: 30,
      }).map((v) => v.code),
    ).toContain('no_auto_create');
    const s = await setup({ write: false });
    const adsetId = s.sources.adsets[0]!.metaId;
    await expect(
      requestLaunch(
        s.ctx,
        { kind: 'create_ad', adAccountId: s.adAccountId, adsetId, creativeId: s.creativeId, name: 'X' },
        { enqueue: s.enqueue, clock },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', details: { reason: 'no_write_access' } });
    await expect(
      previewAction(s.ctx, { adAccountId: s.adAccountId, actionType: 'create_ad', targetMetaId: adsetId }, clock),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    // Rule tự chạy (cờ P2b bật, có quyền ghi) cũng không tạo được.
    const w = await setup();
    await enableFlag(db, {
      workspaceId: w.workspaceId,
      key: 'p2b_auto',
      staffUserId: w.pm.id,
      reason: 'thử auto',
      override: true,
    });
    expect(
      await requestAutoAction(
        w.wctx,
        {
          ruleId: w.workspaceId,
          adAccountId: w.adAccountId,
          actionType: 'create_ad',
          targetMetaId: w.sources.adsets[0]!.metaId,
        },
        { enqueue: w.enqueue, clock },
      ),
    ).toEqual({ skipped: 'no_auto_create' });
  });

  it('Meta lỗi khi tạo → không đoán, không gọi lại, báo kiểm tra thủ công; quảng cáo tạo ra không PAUSED → verify_mismatch', async () => {
    const s = await setup();
    const adsetId = s.sources.adsets[0]!.metaId;
    const mk = (name: string) =>
      requestLaunch(
        s.ctx,
        { kind: 'create_ad', adAccountId: s.adAccountId, adsetId, creativeId: s.creativeId, name },
        { enqueue: s.enqueue, clock },
      );
    const a = await mk('A');
    writer.failNext('error_before');
    expect(await s.run(a.id)).toEqual({ status: 'failed', resultCode: 'meta_error_check_manually' });
    expect(writer.calls.filter((c) => c.op === 'createAd')).toHaveLength(1);
    const b = await mk('B');
    writer.failNext('wrong_value');
    expect(await s.run(b.id)).toEqual({ status: 'failed', resultCode: 'verify_mismatch' });
  });
});

describe('Audience Launcher (ADR-0023)', () => {
  it('lookalike từ custom audience có sẵn: tạo, xác minh LOOKALIKE; nguồn lạ / tỷ lệ / quốc gia sai bị chặn', async () => {
    const s = await setup();
    const origin = s.sources.audiences.find((a) => a.subtype === 'CUSTOM')!.metaId;
    const base = {
      kind: 'create_lookalike' as const,
      adAccountId: s.adAccountId,
      originAudienceId: origin,
      country: 'VN',
      ratioPct: 2,
      name: 'LAL khách cũ',
    };
    await expect(
      requestLaunch(s.ctx, { ...base, originAudienceId: 'ca_khong_co' }, { enqueue: s.enqueue, clock }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(requestLaunch(s.ctx, { ...base, ratioPct: 15 }, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(requestLaunch(s.ctx, { ...base, country: 'vn' }, { enqueue: s.enqueue, clock })).rejects.toMatchObject(
      {
        code: 'VALIDATION_FAILED',
      },
    );
    const a = await requestLaunch(s.ctx, base, { enqueue: s.enqueue, clock });
    expect(a).toMatchObject({
      actionType: 'create_lookalike',
      targetType: 'account',
      tier: 'approve',
      params: { origin_audience_id: origin, country: 'VN', ratio: '0.02' },
    });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    const [row] = await db.select().from(schema.actions).where(eq(schema.actions.id, a.id));
    expect(row!.afterState).toMatchObject({ created_subtype: 'LOOKALIKE' });
    const c = await requestLaunch(s.ctx, { ...base, ratioPct: 3 }, { enqueue: s.enqueue, clock });
    writer.failNext('wrong_value');
    expect(await s.run(c.id)).toEqual({ status: 'failed', resultCode: 'verify_mismatch' });
  });

  it('ADR-0026 custom audience: pixel của đúng tài khoản / tương tác Page; xác minh loại; nguồn lạ, số ngày sai bị chặn', async () => {
    const s = await setup();
    await refreshAssets(s.wctx, s.connectionId, 'mock-token', ['act_100000001', 'act_100000002'], {
      meta: new MockMetaRead(clock.now),
      clock,
    });
    const pixels = await listAssets(s.wctx, 'pixel');
    const own = pixels.find((p) => p.parentId === 'act_100000001')!;
    const other = pixels.find((p) => p.parentId === 'act_100000002')!;
    const page = (await listAssets(s.wctx, 'page'))[0]!;
    const base = { kind: 'create_custom_audience' as const, adAccountId: s.adAccountId, name: 'Thêm giỏ 30 ngày' };
    const deps = { enqueue: s.enqueue, clock };

    // Pixel của tài khoản khác / id lạ → 404; quá 180 ngày, sự kiện lạ → 422.
    await expect(
      requestLaunch(
        s.ctx,
        { ...base, source: { type: 'pixel', id: other.metaId, event: 'AddToCart', days: 30 } },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      requestLaunch(s.ctx, { ...base, source: { type: 'page', id: '999', days: 30 } }, deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      requestLaunch(s.ctx, { ...base, source: { type: 'pixel', id: own.metaId, event: 'AddToCart', days: 181 } }, deps),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      requestLaunch(
        s.ctx,
        { ...base, source: { type: 'pixel', id: own.metaId, event: 'Hack' as never, days: 30 } },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const a = await requestLaunch(
      s.ctx,
      { ...base, source: { type: 'pixel', id: own.metaId, event: 'AddToCart', days: 30 } },
      deps,
    );
    expect(a).toMatchObject({
      actionType: 'create_custom_audience',
      targetType: 'account',
      tier: 'approve',
      params: { source_type: 'pixel', source_id: own.metaId, event: 'AddToCart', days: '30' },
      afterExpected: { created_subtype: 'WEBSITE' },
    });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(writer.calls.at(-1)).toEqual({ op: 'createCustomAudience', id: own.metaId, value: 'pixel:30' });

    const e = await requestLaunch(
      s.ctx,
      { ...base, name: 'Tương tác Page 90 ngày', source: { type: 'page', id: page.metaId, days: 90 } },
      deps,
    );
    expect(e.afterExpected).toEqual({ created_subtype: 'ENGAGEMENT' });
    writer.failNext('wrong_value');
    expect(await s.run(e.id)).toEqual({ status: 'failed', resultCode: 'verify_mismatch' });
  });

  it('ADR-0026 nhóm QC mới: PAUSED, chép mẫu; ngân sách ≤ mẫu +15%; nguồn / nhắm mục tiêu sai bị chặn; không tự chạy', async () => {
    const s = await setup();
    const [tpl] = await db
      .select({
        metaId: schema.entities.metaId,
        parent: schema.entities.parentMetaId,
        budget: schema.entities.dailyBudget,
      })
      .from(schema.entities)
      .where(and(eq(schema.entities.adAccountId, s.adAccountId), eq(schema.entities.entityType, 'adset')))
      .orderBy(schema.entities.metaId)
      .limit(1);
    expect(tpl!.budget).toBeTruthy();
    const audience = s.sources.audiences.find((a) => a.subtype === 'CUSTOM')!.metaId;
    const deps = { enqueue: s.enqueue, clock };
    const budget = (pct: number) => String(Math.round((Number(tpl!.budget) * (100 + pct)) / 100));
    const base = {
      kind: 'create_adset' as const,
      adAccountId: s.adAccountId,
      templateAdsetId: tpl!.metaId,
      name: 'Retarget giỏ hàng · VN 25-44',
      dailyBudget: budget(10),
      countries: ['VN'],
      ageMin: 25,
      ageMax: 44,
      audienceIds: [audience],
    };
    await expect(requestLaunch(s.ctx, { ...base, dailyBudget: budget(30) }, deps)).rejects.toMatchObject({
      code: 'GUARDRAIL_VIOLATION',
      details: { violations: [{ code: 'new_adset_budget_too_large' }] },
    });
    await expect(requestLaunch(s.ctx, { ...base, dailyBudget: null }, deps)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(requestLaunch(s.ctx, { ...base, countries: ['VNM'] }, deps)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(requestLaunch(s.ctx, { ...base, ageMin: 50, ageMax: 30 }, deps)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(requestLaunch(s.ctx, { ...base, audienceIds: ['ca_la'] }, deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(requestLaunch(s.ctx, { ...base, templateAdsetId: '999' }, deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const a = await requestLaunch(s.ctx, base, deps);
    expect(a).toMatchObject({
      actionType: 'create_adset',
      targetType: 'campaign',
      targetMetaId: tpl!.parent,
      tier: 'approve',
      params: { template_id: tpl!.metaId, countries: 'VN', age_min: '25', age_max: '44', audience_ids: audience },
      afterExpected: { created_status: 'PAUSED' },
    });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(writer.calls.at(-1)).toMatchObject({ op: 'createAdSet', id: tpl!.metaId });
    const b = await requestLaunch(s.ctx, { ...base, name: 'Bản 2' }, deps);
    writer.failNext('wrong_value');
    expect(await s.run(b.id)).toEqual({ status: 'failed', resultCode: 'verify_mismatch' });

    // Rule tự động không bao giờ tạo nhóm QC.
    expect(
      checkGuardrails({
        guardrails: { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] },
        actionType: 'create_adset',
        tier: 'auto',
        targetIds: [],
        accountTimezone: 'Asia/Ho_Chi_Minh',
        now: clock.now(),
        actionsToday: 0,
        dataDays: 30,
      }).map((v) => v.code),
    ).toContain('no_auto_create');
  });
});
