import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { backtestRule, estimateRuleSavings, RULE_TEMPLATES, suggestTemplateValues, templateForSource } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const NOW = new Date('2026-10-26T03:00:00Z');
const clock = { now: () => NOW };
const AS_OF = '2026-10-25';

type Day = { spend: number; impressions: number; clicks: number; results: number; frequency: number };

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { confirmed: true });
  const ad = async (id: string, day: (i: number) => Day) => {
    const adset = `s-${id}`;
    await db.insert(schema.entities).values([
      {
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'adset',
        metaId: adset,
        name: `Ad set ${adset}`,
        status: 'ACTIVE',
        dailyBudget: '1000000',
      },
      {
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'ad',
        metaId: id,
        parentMetaId: adset,
        name: `Ad ${id}`,
        status: 'ACTIVE',
      },
    ]);
    await db.insert(schema.insightsDaily).values(
      Array.from({ length: 40 }, (_, i) => ({
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'ad' as const,
        metaId: id,
        adsetId: adset,
        date: addDays(AS_OF, i - 39),
        spend: String(day(i).spend),
        impressions: day(i).impressions,
        linkClicks: day(i).clicks,
        clicks: day(i).clicks,
        results: day(i).results,
        frequency: String(day(i).frequency),
        attributionWindow: '7d_click_1d_view',
      })),
    );
  };
  return { ctx, workspaceId: workspace.id, acc, ad };
}

const tired = (i: number): Day =>
  i >= 33
    ? { spend: 100_000, impressions: 3000, clicks: 30, results: 1, frequency: 3 }
    : { spend: 100_000, impressions: 3000, clicks: 60, results: 2, frequency: 2 };
const fine = (): Day => ({ spend: 100_000, impressions: 3000, clicks: 60, results: 2, frequency: 1.5 });
const fatigue = RULE_TEMPLATES.find((t) => t.key === 'pause_fatigued_ad')!;

describe('ước tính tiết kiệm + ngưỡng từ dữ liệu (Madgicx AI Marketer)', () => {
  it('tạm dừng: chi tiêu của đối tượng từ ngày sau lần kích hoạt đầu tới hết kỳ', async () => {
    const s = await setup();
    await s.ad('a1', tired);
    await s.ad('a2', fine);
    const input = {
      adAccountId: s.acc.id,
      name: 'Tạm dừng ad mệt',
      level: fatigue.level,
      condition: fatigue.condition,
      action: fatigue.action,
    };
    const bt = await backtestRule(s.ctx, input, clock);
    const first = bt.items.map((i) => i.date).sort()[0]!;
    const daysAfter = bt.days - 1 - (Date.parse(first) - Date.parse(addDays(AS_OF, -(bt.days - 1)))) / 86_400_000;
    const r = await estimateRuleSavings(s.ctx, input, clock);
    expect(r).toMatchObject({ kind: 'saved', currency: 'VND', entities: 1, days: 30 });
    expect(Number(r.amount)).toBe(100_000 * daysAfter);
    expect(r.items).toEqual(bt.items);
  });

  it('giảm ngân sách 15% → 15% chi tiêu sau kích hoạt; tăng ngân sách → "chi thêm"; không khớp → none', async () => {
    const s = await setup();
    await s.ad('a1', fine);
    const base = { adAccountId: s.acc.id, name: 'r', level: 'adset' as const };
    // Khớp mọi ngày → kích hoạt ngày đầu kỳ; 29 ngày sau × 100.000 × 15%.
    const down = await estimateRuleSavings(
      s.ctx,
      {
        ...base,
        condition: [{ metric: 'spend', op: 'gte', value: '0' }],
        action: { type: 'set_adset_budget', changePct: '-15' },
      },
      clock,
    );
    expect(down).toMatchObject({ kind: 'saved', entities: 1 });
    expect(Number(down.amount)).toBe(435_000);
    const up = await estimateRuleSavings(
      s.ctx,
      {
        ...base,
        condition: [{ metric: 'spend', op: 'gte', value: '0' }],
        action: { type: 'set_adset_budget', changePct: '10', maxDailyBudget: '2000000' },
      },
      clock,
    );
    expect(up).toMatchObject({ kind: 'extra' });
    expect(Number(up.amount)).toBe(290_000);
    const none = await estimateRuleSavings(
      s.ctx,
      { ...base, condition: [{ metric: 'spend', op: 'gte', value: '999999999' }], action: { type: 'pause_adset' } },
      clock,
    );
    expect(none).toMatchObject({ kind: 'none', amount: '0', entities: 0 });
  });

  it('ngưỡng gợi ý: chi ≥ 2 × CPA 30 ngày, tần suất 1,5 × trung bình; kèm lý do', async () => {
    const s = await setup();
    await s.ad('a1', fine);
    const noRes = await suggestTemplateValues(s.ctx, 'pause_adset_no_results', s.acc.id, clock);
    // CPA 30 ngày = 100.000 / 2 = 50.000 → ngưỡng 100.000.
    expect(noRes.condition.find((c) => c.metric === 'spend')!.value).toBe('100000');
    expect(noRes.suggested).toEqual([
      { index: 0, value: '100000', reason: { key: 'cpa_x2', params: { cpa: '50000', currency: 'VND' } } },
    ]);
    const fat = await suggestTemplateValues(s.ctx, 'pause_fatigued_ad', s.acc.id, clock);
    expect(fat.suggested).toEqual([
      { index: 1, value: '2.3', reason: { key: 'frequency_x1_5', params: { frequency: '1.50' } } },
    ]);
  });

  it('không đủ dữ liệu thì không gợi ý (giữ giá trị mẫu); buyer không được; mẫu lạ → 404', async () => {
    const s = await setup();
    const r = await suggestTemplateValues(s.ctx, 'pause_adset_no_results', s.acc.id, clock);
    expect(r.suggested).toEqual([]);
    expect(r.condition).toEqual(RULE_TEMPLATES.find((t) => t.key === 'pause_adset_no_results')!.condition);
    await expect(suggestTemplateValues(s.ctx, 'khong_co', s.acc.id, clock)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const buyer = await seedMember(db, s.workspaceId, 'buyer');
    const bctx = { ...s.ctx, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    await expect(suggestTemplateValues(bctx, 'pause_adset_no_results', s.acc.id, clock)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(templateForSource('spend_no_conversion')).toBe('pause_adset_no_results');
    expect(templateForSource('khong_co')).toBeNull();
  });
});
