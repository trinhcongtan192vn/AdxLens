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
import { resolveActor } from '@adxlens/core/tenancy';
import {
  addCreativeDraft,
  approveActionPlan,
  cancelActionPlan,
  createActionPlan,
  getActionPlan,
  parsePlanSteps,
  PLAN_TTL_MS,
  runActionPlan,
  type PlanStepResult,
} from './index';

const db = testDb();
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 31).toString('base64') });
const NOW = new Date('2026-10-23T03:00:00Z');
const clock = { now: () => NOW };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let writer: MockMetaWrite;
beforeEach(async () => {
  await truncateAll(db);
  mockWriteState.reset();
  writer = new MockMetaWrite();
});

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-write-plan',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `p-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client P' }).returning();
  await assignAdAccount(ctx, adAccountId, { clientId: client!.id });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, {
    meta: new MockMetaRead(clock.now),
    keys: KEYS.keys,
    clock,
  });
  await setWriteEnabled(ctx, connectionId, true);
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test plan', override: true });
  }
  await setSubscription(ctx, { planKey: 'growth' });
  const wctx = { db, workspaceId: workspace.id };
  await refreshAssets(wctx, connectionId, 'mock-token', ['act_100000001'], {
    meta: new MockMetaRead(clock.now),
    clock,
  });
  const page = (await listAssets(wctx, 'page'))[0]!;
  const [tpl] = await db
    .select({ metaId: schema.entities.metaId, budget: schema.entities.dailyBudget })
    .from(schema.entities)
    .where(and(eq(schema.entities.adAccountId, adAccountId), eq(schema.entities.entityType, 'adset')))
    .orderBy(schema.entities.metaId)
    .limit(1);
  const draft = await addCreativeDraft(ctx, {
    adAccountId,
    source: 'upload',
    storagePath: `${workspace.id}/${adAccountId}/a.png`,
    contentType: 'image/png',
  });
  const steps = [
    {
      key: 'creative',
      kind: 'create_creative',
      draftId: draft.id,
      pageId: page.metaId,
      link: 'https://shop.example.vn/sale',
      message: 'Sale cuối tuần',
      headline: 'Sale cuối tuần',
      cta: 'SHOP_NOW',
      name: 'Sale T10 · ảnh 1',
    },
    {
      key: 'adset',
      kind: 'create_adset',
      templateAdsetId: tpl!.metaId,
      name: 'Sale T10 · VN 25-44',
      dailyBudget: String(tpl!.budget ? Math.round(Number(tpl!.budget)) : ''),
      countries: ['VN'],
      ageMin: 25,
      ageMax: 44,
      audienceIds: [],
    },
    { key: 'ad', kind: 'create_ad', adset: { ref: 'adset' }, creative: { ref: 'creative' }, name: 'Sale T10 · QC 1' },
  ];
  const deps = { writer, keys: KEYS.keys, clock, enqueue, readCreativeImage: async () => PNG };
  return { ctx, wctx, workspace, clientId: client!.id, adAccountId, enqueue, steps, deps, tpl: tpl! };
}

const results = async (wctx: { workspaceId: string }, id: string) => {
  const [p] = await db.select().from(schema.actionPlans).where(eq(schema.actionPlans.id, id));
  expect(p!.workspaceId).toBe(wctx.workspaceId);
  return { status: p!.status, results: p!.results as PlanStepResult[] };
};

describe('Kế hoạch hành động (ADR-0031)', () => {
  it('bước: tham chiếu chỉ tới bước trước, đúng loại; khóa trùng; quá số bước → từ chối', () => {
    const ad = { key: 'ad', kind: 'create_ad', adset: '1', creative: '2', name: 'A' };
    expect(parsePlanSteps([ad])).toHaveLength(1);
    expect(() => parsePlanSteps([{ ...ad, creative: { ref: 'later' } }])).toThrow(/tham chiếu/);
    expect(() =>
      parsePlanSteps([
        { key: 'x', kind: 'create_ad', adset: '1', creative: '2', name: 'A' },
        { ...ad, adset: { ref: 'x' } },
      ]),
    ).toThrow(/tham chiếu/);
    expect(() => parsePlanSteps([ad, ad])).toThrow(/trùng/);
    expect(() => parsePlanSteps(Array.from({ length: 7 }, (_, i) => ({ ...ad, key: `a${i}` })))).toThrow();
    expect(() => parsePlanSteps([{ ...ad, adset: 'a b;' }])).toThrow();
  });

  it('duyệt một lần → chạy tuần tự: creative → nhóm QC → quảng cáo dùng id vừa tạo; mọi thứ PAUSED; nhật ký từng bước', async () => {
    const s = await setup();
    const plan = await createActionPlan(
      s.ctx,
      { adAccountId: s.adAccountId, title: 'Sale T10', steps: s.steps, source: 'agent' },
      clock,
    );
    expect(plan).toMatchObject({ status: 'proposed', source: 'agent' });
    // Tạo kế hoạch không tạo hành động, không gọi Meta.
    expect(await db.select().from(schema.actions).where(eq(schema.actions.workspaceId, s.workspace.id))).toEqual([]);

    const r = await approveActionPlan(s.ctx, plan.id, { enqueue: s.enqueue, clock });
    expect(r.checks.map((c) => [c.key, c.ok, c.deferred ?? false])).toEqual([
      ['creative', true, false],
      ['adset', true, false],
      ['ad', true, true],
    ]);
    expect(s.enqueue.calls.at(-1)).toMatchObject({
      name: 'execute:plan',
      payload: { workspaceId: s.workspace.id, planId: plan.id },
    });
    await expect(approveActionPlan(s.ctx, plan.id, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    expect(await runActionPlan(s.wctx, plan.id, s.deps)).toEqual({ status: 'done' });
    const out = await results(s.wctx, plan.id);
    expect(out.status).toBe('done');
    expect(out.results.map((x) => x.status)).toEqual(['success', 'success', 'success']);
    const acts = await db.select().from(schema.actions).where(eq(schema.actions.workspaceId, s.workspace.id));
    expect(acts.map((a) => [a.actionType, a.status, a.params.plan_id])).toEqual(
      expect.arrayContaining([
        ['create_creative', 'success', plan.id],
        ['create_adset', 'success', plan.id],
        ['create_ad', 'success', plan.id],
      ]),
    );
    const ad = acts.find((a) => a.actionType === 'create_ad')!;
    expect(ad.targetMetaId).toBe(out.results[1]!.createdId);
    expect(ad.params.creative_id).toBe(out.results[0]!.createdId);
    expect(ad.afterState).toMatchObject({ created_status: 'PAUSED' });
    // Chạy lại job → bỏ qua (không ghi lần hai).
    expect(await runActionPlan(s.wctx, plan.id, s.deps)).toEqual({ status: 'skipped' });
  });

  it('một bước lỗi → dừng, bước sau skipped, đối tượng đã tạo giữ nguyên', async () => {
    const s = await setup();
    const plan = await createActionPlan(
      s.ctx,
      { adAccountId: s.adAccountId, title: 'Sale', steps: s.steps, source: 'user' },
      clock,
    );
    await approveActionPlan(s.ctx, plan.id, { enqueue: s.enqueue, clock });
    const realCreate = writer.createAdSet.bind(writer);
    writer.createAdSet = async () => {
      throw new Error('boom');
    };
    expect(await runActionPlan(s.wctx, plan.id, s.deps)).toMatchObject({ status: 'failed' });
    writer.createAdSet = realCreate;
    const out = await results(s.wctx, plan.id);
    expect(out.status).toBe('failed');
    expect(out.results.map((x) => x.status)).toEqual(['success', 'failed', 'skipped']);
    expect(out.results[1]!.code).toBe('meta_error_check_manually');
  });

  it('duyệt bị chặn: guardrails từng bước, quyền duyệt, hết hạn; hủy; cờ tắt (tạo / chạy)', async () => {
    const s = await setup();
    const big = s.steps.map((x) =>
      x.kind === 'create_adset' ? { ...x, dailyBudget: String(Math.round(Number(s.tpl.budget) * 2)) } : x,
    );
    const p1 = await createActionPlan(
      s.ctx,
      { adAccountId: s.adAccountId, title: 'Lớn', steps: big, source: 'agent' },
      clock,
    );
    const e = (await approveActionPlan(s.ctx, p1.id, { enqueue: s.enqueue, clock }).catch((x: unknown) => x)) as {
      code: string;
      details: { checks: { key: string; ok: boolean; violations?: { code: string }[] }[] };
    };
    expect(e.code).toBe('GUARDRAIL_VIOLATION');
    expect(e.details.checks.find((c) => c.key === 'adset')).toMatchObject({
      ok: false,
      violations: [{ code: 'new_adset_budget_too_large' }],
    });
    expect((await getActionPlan(s.ctx, p1.id)).status).toBe('proposed');

    // Buyer không được gán Client: không xem, không duyệt.
    const buyer = await seedMember(db, s.workspace.id, 'buyer');
    const bctx = { ...s.ctx, actor: (await resolveActor(db, s.workspace.id, buyer.id))! };
    await expect(approveActionPlan(bctx, p1.id, { enqueue: s.enqueue, clock })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const p2 = await createActionPlan(
      s.ctx,
      { adAccountId: s.adAccountId, title: 'Cũ', steps: s.steps, source: 'agent' },
      clock,
    );
    const later = { now: () => new Date(NOW.getTime() + PLAN_TTL_MS + 1) };
    await expect(approveActionPlan(s.ctx, p2.id, { enqueue: s.enqueue, clock: later })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'expired' },
    });
    expect((await cancelActionPlan(s.ctx, p2.id, clock)).status).toBe('canceled');
    await expect(cancelActionPlan(s.ctx, p2.id, clock)).rejects.toMatchObject({ code: 'CONFLICT' });

    // Duyệt xong rồi cờ tắt trước khi job chạy → không bước nào chạy.
    const p3 = await createActionPlan(
      s.ctx,
      { adAccountId: s.adAccountId, title: 'OK', steps: s.steps, source: 'agent' },
      clock,
    );
    await approveActionPlan(s.ctx, p3.id, { enqueue: s.enqueue, clock });
    const pm = await seedStaff(db, true);
    await disableFlag(db, {
      workspaceId: s.workspace.id,
      key: 'p2a_approve',
      staffUserId: pm.id,
      reason: 'test off',
    });
    expect(await runActionPlan(s.wctx, p3.id, s.deps)).toEqual({ status: 'failed', code: 'feature_disabled' });
    expect((await results(s.wctx, p3.id)).results.map((x) => x.status)).toEqual(['failed', 'skipped', 'skipped']);
    await expect(
      createActionPlan(s.ctx, { adAccountId: s.adAccountId, title: 'X', steps: s.steps, source: 'agent' }, clock),
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('giới hạn hành động / ngày tính cả các bước trước trong kế hoạch', async () => {
    const s = await setup();
    const ads = Array.from({ length: 6 }, (_, i) => ({
      key: `ad${i}`,
      kind: 'create_ad',
      adset: s.tpl.metaId,
      creative: '1',
      name: `QC ${i}`,
    }));
    const [cr] = await db
      .select({ metaId: schema.entities.metaId })
      .from(schema.entities)
      .where(and(eq(schema.entities.adAccountId, s.adAccountId), eq(schema.entities.entityType, 'creative')))
      .limit(1);
    const plan = await createActionPlan(
      s.ctx,
      {
        adAccountId: s.adAccountId,
        title: '6 QC',
        steps: ads.map((a) => ({ ...a, creative: cr!.metaId })),
        source: 'agent',
      },
      clock,
    );
    const e = (await approveActionPlan(s.ctx, plan.id, { enqueue: s.enqueue, clock }).catch((x: unknown) => x)) as {
      details: { checks: { key: string; ok: boolean; violations?: { code: string }[] }[] };
    };
    // Mặc định 5 hành động / ngày: bước thứ 6 vượt.
    expect(e.details.checks.map((c) => c.ok)).toEqual([true, true, true, true, true, false]);
    expect(e.details.checks[5]!.violations).toEqual([expect.objectContaining({ code: 'too_many_actions' })]);
  });
});
