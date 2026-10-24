import { describe, expect, it } from 'vitest';
import { explainCpaChange } from './cpa-change';
import type { EntityRow, Kpis } from './metrics';

const k = (spend: number, impressions: number, linkClicks: number, results: number): Kpis => ({
  spend: String(spend),
  impressions,
  reach: impressions,
  clicks: linkClicks,
  linkClicks,
  results,
  conversionValue: '0',
  ctr: linkClicks / impressions,
  cpa: results ? String(spend / results) : null,
  roas: null,
  cpm: String((spend / impressions) * 1000),
  resultTypes: [],
});
const camp = (metaId: string, kpis: Kpis): EntityRow => ({
  adAccountId: 'a',
  metaId,
  name: `Camp ${metaId}`,
  status: 'ACTIVE',
  parentMetaId: null,
  kpis,
});

describe('vì sao CPA thay đổi (A1)', () => {
  it('CPA tăng do CVR giảm: yếu tố CVR chiếm phần lớn; tổng phần yếu tố = 100%', () => {
    // CPM, CTR giữ nguyên; CVR 10% → 5% ⇒ CPA × 2.
    const prev = k(1_000_000, 100_000, 1_000, 100);
    const cur = k(1_000_000, 100_000, 1_000, 50);
    const r = explainCpaChange(cur, prev, { current: [], previous: [] })!;
    expect(r.changePct).toBe(100);
    expect(r.factors[0]).toMatchObject({ key: 'cvr', changePct: -50, sharePct: 100 });
    expect(r.factors.reduce((s, f) => s + f.sharePct, 0)).toBeCloseTo(100, 0);
  });

  it('chiến dịch đóng góp: cộng lại đúng thay đổi CPA, chỉ lấy chiến dịch cùng chiều, xếp theo mức đóng góp', () => {
    // Kỳ trước: A 500k/50, B 500k/50 → CPA 10k. Kỳ này: A 500k/50 (giữ), B 900k/30 (xấu đi) → CPA 1.4M/80 = 17.5k.
    const prevA = k(500_000, 50_000, 500, 50);
    const prevB = k(500_000, 50_000, 500, 50);
    const curA = k(500_000, 50_000, 500, 50);
    const curB = k(900_000, 60_000, 500, 30);
    const r = explainCpaChange(k(1_400_000, 110_000, 1_000, 80), k(1_000_000, 100_000, 1_000, 100), {
      current: [camp('A', curA), camp('B', curB)],
      previous: [camp('A', prevA), camp('B', prevB)],
    })!;
    expect(r.changePct).toBe(75);
    expect(r.drivers[0]).toMatchObject({ metaId: 'B', name: 'Camp B', previousCpa: '10000', cpa: '30000' });
    expect(r.drivers.every((d) => d.sharePct > 0)).toBe(true);
    expect(r.drivers[0]!.sharePct).toBeGreaterThan(90);
  });

  it('không đủ dữ liệu (< 10 kết quả, thiếu click) hoặc CPA đổi < 5% → không giải thích', () => {
    const prev = k(1_000_000, 100_000, 1_000, 100);
    expect(explainCpaChange(k(100_000, 10_000, 100, 9), prev, { current: [], previous: [] })).toBeNull();
    expect(explainCpaChange(k(1_000_000, 100_000, 0, 100), prev, { current: [], previous: [] })).toBeNull();
    expect(explainCpaChange(k(1_020_000, 100_000, 1_000, 100), prev, { current: [], previous: [] })).toBeNull();
  });
});
