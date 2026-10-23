import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedMember,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { setSubscription } from '@adxlens/core/billing';
import { enableFlag } from '@adxlens/core/flags';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  backtestRule,
  createRule,
  entityMetrics,
  getRule,
  listRules,
  listRuleTemplates,
  matchConditions,
  RULE_TEMPLATES,
  ruleBudget,
  ruleEvaluationsFor,
  saveGuardrails,
  GUARDRAIL_DEFAULTS,
  setRuleMode,
  shadowEvaluate,
  simulateShadowDays,
  type RuleInput,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

// 10:00 ngày 26/10 giờ VN → ngày dữ liệu gần nhất 25/10.
const NOW = new Date('2026-10-26T03:00:00Z');
const clock = { now: () => NOW };
const AS_OF = '2026-10-25';

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const client = await seedClient(db, workspace.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed: true });
  /** Ad trong ad set `adset`; `day(i)` cho 40 ngày tới AS_OF (i = 0 là ngày cũ nhất). */
  const ad = async (
    id: string,
    day: (i: number) => { spend: number; impressions: number; clicks: number; results: number; frequency: number },
    opts: { status?: string; adset?: string; budget?: string } = {},
  ) => {
    const adset = opts.adset ?? `s-${id}`;
    await db
      .insert(schema.entities)
      .values({
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'adset',
        metaId: adset,
        name: `Ad set ${adset}`,
        status: 'ACTIVE',
        dailyBudget: opts.budget ?? '1000000',
      })
      .onConflictDoNothing();
    await db.insert(schema.entities).values({
      workspaceId: workspace.id,
      adAccountId: acc.id,
      entityType: 'ad',
      metaId: id,
      parentMetaId: adset,
      name: `Ad ${id}`,
      status: opts.status ?? 'ACTIVE',
    });
    await db.insert(schema.insightsDaily).values(
      Array.from({ length: 40 }, (_, i) => {
        const d = day(i);
        return {
          workspaceId: workspace.id,
          adAccountId: acc.id,
          entityType: 'ad' as const,
          metaId: id,
          adsetId: adset,
          date: addDays(AS_OF, i - 39),
          spend: String(d.spend),
          impressions: d.impressions,
          linkClicks: d.clicks,
          clicks: d.clicks,
          results: d.results,
          frequency: String(d.frequency),
          attributionWindow: '7d_click_1d_view',
        };
      }),
    );
  };
  return { ctx, workspaceId: workspace.id, acc, client, ad };
}

// Mệt ở 7 ngày cuối: CTR 2% → 1%, tần suất 2 → 3.
const tired = (i: number) =>
  i >= 33
    ? { spend: 100_000, impressions: 3000, clicks: 30, results: 1, frequency: 3 }
    : { spend: 100_000, impressions: 3000, clicks: 60, results: 2, frequency: 2 };
const fine = () => ({ spend: 100_000, impressions: 3000, clicks: 60, results: 2, frequency: 1.5 });
const fatigue = RULE_TEMPLATES.find((t) => t.key === 'pause_fatigued_ad')!;
const fatigueInput = (adAccountId: string): RuleInput => ({
  adAccountId,
  name: 'Tạm dừng ad mệt',
  templateKey: fatigue.key,
  level: fatigue.level,
  condition: fatigue.condition,
  action: fatigue.action,
});

describe('điều kiện và kế hoạch (ADR-0012)', () => {
  it('chỉ số 7 ngày từ snapshot; mẫu "ad mệt" khớp đúng ad, bỏ ad đã tắt', async () => {
    const s = await setup();
    await s.ad('a1', tired);
    await s.ad('a2', fine);
    await s.ad('a3', tired, { status: 'PAUSED' });
    const m = await entityMetrics(s.ctx, s.acc.id, 'ad', AS_OF);
    const a1 = m.find((x) => x.metaId === 'a1')!;
    expect(a1.metrics).toMatchObject({
      spend: '700000.0000',
      results: '7',
      ctr_change_pct: '-50.00',
      frequency: '3.0000',
    });
    const matched = m.filter((e) => matchConditions(fatigue.condition, e)).map((e) => e.metaId);
    expect(matched).toEqual(['a1']);
  });

  it('ngân sách: % làm tròn xuống, không vượt trần; null khi không có ngân sách ngày', () => {
    expect(ruleBudget('1000000', '-15')).toBe('850000');
    expect(ruleBudget('333333', '-15')).toBe('283333');
    expect(ruleBudget('1000000', '10', '1050000')).toBe('1050000');
    expect(ruleBudget(null, '-15')).toBeNull();
  });

  it('kiểm hợp lệ: cấp khớp hành động, ±15%, tăng phải có trần, guardrails rule chỉ chặt hơn', async () => {
    const s = await setup();
    const base = fatigueInput(s.acc.id);
    await expect(createRule(s.ctx, { ...base, level: 'adset' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const budget = {
      ...base,
      level: 'adset' as const,
      action: { type: 'set_adset_budget' as const, changePct: '-20' },
    };
    await expect(createRule(s.ctx, budget)).rejects.toMatchObject({ code: 'GUARDRAIL_VIOLATION' });
    await expect(
      createRule(s.ctx, { ...budget, action: { type: 'set_adset_budget', changePct: '10' } }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [], maxActionsPerDay: 3 });
    await expect(createRule(s.ctx, { ...base, guardrails: { maxActionsPerDay: 4 } })).rejects.toMatchObject({
      code: 'GUARDRAIL_VIOLATION',
    });
    expect((await createRule(s.ctx, { ...base, guardrails: { maxActionsPerDay: 2 } })).mode).toBe('shadow');
  });
});

describe('vòng đời rule: shadow → live (ADR-0012 mục 4)', () => {
  it('tạo mới ở shadow; live bị chặn khi cờ tắt, chưa đủ 14 ngày, gói Free; đủ điều kiện thì bật; về shadow đặt lại mốc', async () => {
    const s = await setup();
    const r = await createRule(s.ctx, fatigueInput(s.acc.id), clock);
    expect(r).toMatchObject({ mode: 'shadow' });
    await expect(setRuleMode(s.ctx, r.id, 'live', clock)).rejects.toMatchObject({
      details: { reason: 'feature_disabled' },
    });
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'] as const) {
      await enableFlag(db, {
        workspaceId: s.workspaceId,
        key,
        staffUserId: pm.id,
        reason: 'test rule',
        override: true,
      });
    }
    await expect(setRuleMode(s.ctx, r.id, 'live', clock)).rejects.toMatchObject({
      details: { reason: 'plan_required' },
    });
    await setSubscription(s.ctx, { planKey: 'growth' });
    await expect(setRuleMode(s.ctx, r.id, 'live', clock)).rejects.toMatchObject({
      details: { reason: 'shadow_too_short' },
    });
    const later = { now: () => new Date(NOW.getTime() + 14 * 86_400_000) };
    expect((await setRuleMode(s.ctx, r.id, 'live', later)).mode).toBe('live');
    const back = await setRuleMode(s.ctx, r.id, 'shadow', later);
    expect(back.shadowStartedAt?.toISOString()).toBe(later.now().toISOString());
  });

  it('chỉ owner/manager; buyer và workspace khác không thấy rule', async () => {
    const s = await setup();
    const r = await createRule(s.ctx, fatigueInput(s.acc.id), clock);
    const buyer = await seedMember(db, s.workspaceId, 'buyer', [s.client.id]);
    const bctx = { db, workspaceId: s.workspaceId, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    await expect(createRule(bctx, fatigueInput(s.acc.id))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const other = await setup();
    await expect(getRule(other.ctx, r.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await listRules(other.ctx)).toEqual([]);
    expect((await listRules(s.ctx)).map((x) => x.id)).toEqual([r.id]);
  });
});

describe('backtest và shadow (P2-11, P2-13)', () => {
  it('backtest 30 ngày: liệt kê ngày sẽ làm, mỗi đối tượng không quá một lần / 24 giờ', async () => {
    const s = await setup();
    await s.ad('a1', tired);
    await s.ad('a2', fine);
    const b = await backtestRule(s.ctx, fatigueInput(s.acc.id), clock);
    expect(b.days).toBe(30);
    expect(b.items.length).toBeGreaterThan(0);
    expect(new Set(b.items.map((i) => i.metaId))).toEqual(new Set(['a1']));
    const dates = b.items.map((i) => i.date).sort();
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > addDays(dates[i - 1]!, 1)).toBe(true);
  });

  it('shadow ghi would_do một lần mỗi ngày dữ liệu; danh sách loại trừ hiện lý do chặn; không tạo hành động', async () => {
    const s = await setup();
    await s.ad('101', tired);
    await s.ad('104', tired);
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: ['104'] });
    const r = await createRule(s.ctx, fatigueInput(s.acc.id), clock);
    expect(await shadowEvaluate({ db, workspaceId: s.workspaceId }, r.id, clock)).toEqual({
      status: 'recorded',
      matched: 2,
    });
    expect((await shadowEvaluate({ db, workspaceId: s.workspaceId }, r.id, clock)).status).toBe('duplicate');
    const [ev] = await ruleEvaluationsFor(s.ctx, r.id);
    expect(ev).toMatchObject({ mode: 'shadow', asOfDate: AS_OF });
    const byId = Object.fromEntries(ev!.wouldDo.map((w) => [w.metaId, w.blockedBy]));
    expect(byId).toEqual({ '101': null, '104': 'excluded' });
    expect(await db.select().from(schema.actions).where(eq(schema.actions.workspaceId, s.workspaceId))).toEqual([]);
  });

  it('mẫu sắp theo số gợi ý loại đó đã làm', async () => {
    const s = await setup();
    await db.insert(schema.recommendations).values({
      workspaceId: s.workspaceId,
      adAccountId: s.acc.id,
      week: '2026-10-19',
      source: 'finding',
      sourceKey: 'spend_no_conversion',
      entityType: 'adset',
      metaId: 'x',
      action: { key: 'a' },
      why: { key: 'b' },
      evidence: {},
      confidence: '0.8',
      effortMinutes: 10,
      score: '1',
      status: 'done',
    });
    expect((await listRuleTemplates(s.ctx))[0]).toMatchObject({ key: 'pause_adset_no_results', doneCount: 1 });
  });
});

describe('giả lập thời gian (chỉ local)', () => {
  it('ghi đánh giá cho N ngày trước và lùi mốc shadow → đủ điều kiện thời gian để bật live', async () => {
    const s = await setup();
    await s.ad('101', tired);
    const r = await createRule(s.ctx, fatigueInput(s.acc.id), clock);
    const out = await simulateShadowDays({ db, workspaceId: s.workspaceId }, r.id, 14, clock);
    expect(out.recorded).toBe(14);
    expect((await ruleEvaluationsFor(s.ctx, r.id)).length).toBe(14);
    const [row] = await db.select().from(schema.automationRules).where(eq(schema.automationRules.id, r.id));
    expect(row!.shadowStartedAt?.toISOString()).toBe(new Date(NOW.getTime() - 14 * 86_400_000).toISOString());
  });
});
