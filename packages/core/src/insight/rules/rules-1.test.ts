import { describe, expect, it } from 'vitest';
import { ent, snapshot } from '../testing';
import { budgetMisallocation, creativeFatigue, fragmentation, starvedWinner } from './index';

const run = <C extends Record<string, number>>(
  r: { detect: (s: ReturnType<typeof snapshot>, c: C) => unknown[]; defaults: C },
  s: ReturnType<typeof snapshot>,
  over: Partial<C> = {},
) => r.detect(s, { ...r.defaults, ...over }) as { metaId: string; severity: string; impactEstimate: string | null }[];

describe('creative_fatigue', () => {
  const tired = (p: { curFreq?: number; curClicks?: number; curDays?: number; prevClicks?: number } = {}) =>
    snapshot({
      ads: [
        ent('ad1', {
          prev: {
            impressions: 20000,
            linkClicks: p.prevClicks ?? 400,
            frequency: 1.8,
            spend: '1000000',
            activeDays: 7,
          },
          cur: {
            impressions: 20000,
            linkClicks: p.curClicks ?? 180,
            frequency: p.curFreq ?? 3.2,
            spend: '1000000',
            activeDays: p.curDays ?? 7,
          },
        }),
      ],
    });

  it('tần suất tăng + CTR giảm 55% → high, tác động = chi tiêu × mức giảm CTR', () => {
    const [f] = run(creativeFatigue, tired());
    expect(f).toMatchObject({ metaId: 'ad1', severity: 'high', impactEstimate: '550000.0000' });
  });
  it('CTR giảm 30% → medium', () => {
    expect(run(creativeFatigue, tired({ curClicks: 280 }))[0]!.severity).toBe('medium');
  });
  it('không đủ dữ liệu → không phát hiện (ít ngày, ít click nền)', () => {
    expect(run(creativeFatigue, tired({ curDays: 3 }))).toEqual([]);
    expect(run(creativeFatigue, tired({ prevClicks: 10, curClicks: 2 }))).toEqual([]);
  });
  it('tần suất thấp hoặc CTR giảm ít → không phát hiện', () => {
    expect(run(creativeFatigue, tired({ curFreq: 2.0 }))).toEqual([]);
    expect(run(creativeFatigue, tired({ curClicks: 360 }))).toEqual([]);
  });
});

describe('budget_misallocation', () => {
  const peer = (id: string, spend: string, results: number) =>
    ent(id, { attrs: { optimization_goal: 'LEAD_GENERATION' }, cur: { spend, results } });

  it('ad set chiếm nhiều chi tiêu với CPA ≥ 2× trung vị → high', () => {
    const s = snapshot({
      adsets: [peer('a', '1000000', 20), peer('b', '1000000', 18), peer('c', '6000000', 20)],
    });
    // CPA: a 50k, b 55.6k, c 300k; trung vị 55.6k → c gấp 5,4 lần.
    const [f] = run(budgetMisallocation, s);
    expect(f).toMatchObject({ metaId: 'c', severity: 'high' });
    expect(Number(f!.impactEstimate)).toBeGreaterThan(4_800_000);
  });
  it('không đủ ad set cùng mục tiêu hoặc đủ kết quả → không phát hiện', () => {
    expect(
      run(budgetMisallocation, snapshot({ adsets: [peer('a', '1000000', 20), peer('c', '6000000', 20)] })),
    ).toEqual([]);
    expect(
      run(
        budgetMisallocation,
        snapshot({ adsets: [peer('a', '1000000', 20), peer('b', '1000000', 2), peer('c', '6000000', 20)] }),
      ),
    ).toEqual([]);
  });
  it('khác mục tiêu không so với nhau', () => {
    const other = ent('d', { attrs: { optimization_goal: 'LINK_CLICKS' }, cur: { spend: '9000000', results: 10 } });
    const s = snapshot({
      adsets: [peer('a', '1000000', 20), peer('b', '1000000', 18), peer('c', '1200000', 20), other],
    });
    expect(run(budgetMisallocation, s)).toEqual([]);
  });
});

describe('starved_winner', () => {
  const build = (winnerResults: number) =>
    snapshot({
      adsets: [ent('s1', { cur: { spend: '3000000', results: 30 + winnerResults } })],
      ads: [
        ent('x', { parentMetaId: 's1', cur: { spend: '1500000', results: 15 } }),
        ent('y', { parentMetaId: 's1', cur: { spend: '1300000', results: 15 } }),
        ent('w', { parentMetaId: 's1', cur: { spend: '200000', results: winnerResults } }),
      ],
    });
  it('ad CPA tốt hơn nhiều nhưng chỉ nhận ~7% chi tiêu → medium, không ước tính tiền', () => {
    const [f] = run(starvedWinner, build(8));
    expect(f).toMatchObject({ metaId: 'w', severity: 'medium', impactEstimate: null });
  });
  it('ít kết quả → không phát hiện', () => {
    expect(run(starvedWinner, build(3))).toEqual([]);
  });
});

describe('fragmentation', () => {
  const camp = (n: number, budget: string | null, stage: string | null = null) =>
    snapshot({
      campaigns: [ent('c1')],
      adsets: Array.from({ length: n }, (_, i) =>
        ent(`s${i}`, { parentMetaId: 'c1', dailyBudget: budget, learningStage: stage }),
      ),
    });
  it('6 ad set ngân sách 50.000đ → phát hiện', () => {
    expect(run(fragmentation, camp(6, '50000'))).toMatchObject([{ metaId: 'c1', severity: 'medium' }]);
  });
  it('học hạn chế cũng tính là yếu', () => {
    expect(run(fragmentation, camp(4, '500000', 'LEARNING_LIMITED'))).toHaveLength(1);
  });
  it('ít ad set, ngân sách đủ, hoặc thiếu tín hiệu → không phát hiện', () => {
    expect(run(fragmentation, camp(3, '50000'))).toEqual([]);
    expect(run(fragmentation, camp(6, '500000'))).toEqual([]);
    expect(run(fragmentation, camp(6, null))).toEqual([]);
  });
  it('ngưỡng theo tiền tệ: USD 3/ngày là nhỏ', () => {
    const s = camp(5, '3');
    s.account.currency = 'USD';
    expect(run(fragmentation, s)).toHaveLength(1);
  });
});
