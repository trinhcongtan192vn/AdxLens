import { describe, expect, it } from 'vitest';
import { cpaInsight } from './cpa-insight';

describe('đọc nhanh vì sao CPA đổi', () => {
  it('CPA tăng: nguyên nhân chính là yếu tố giải thích ≥ 50%; yếu tố bù ngược là "tốt"; bỏ yếu tố < 5%', () => {
    const r = cpaInsight({
      changePct: 30,
      factors: [
        { key: 'ctr', changePct: -2, sharePct: 3 },
        { key: 'cpm', changePct: -8, sharePct: -30 },
        { key: 'cvr', changePct: -35, sharePct: 127 },
      ],
      drivers: [
        { metaId: 'a', sharePct: 80 },
        { metaId: 'b', sharePct: -15 },
      ],
    });
    expect(r).toMatchObject({ direction: 'up', good: false, main: 'cvr' });
    expect(r.factors.map((f) => [f.key, f.effect, f.bar])).toEqual([
      ['cvr', 'worse', 100],
      ['cpm', 'better', 30],
    ]);
    expect(r.drivers.map((d) => [d.metaId, d.effect, d.bar])).toEqual([
      ['a', 'worse', 80],
      ['b', 'better', 15],
    ]);
  });

  it('CPA giảm: yếu tố cùng chiều là "tốt"; không yếu tố nào ≥ 50% → nhiều yếu tố', () => {
    const r = cpaInsight({
      changePct: -20,
      factors: [
        { key: 'cpm', changePct: -10, sharePct: 45 },
        { key: 'ctr', changePct: 12, sharePct: 40 },
        { key: 'cvr', changePct: 3, sharePct: 15 },
      ],
      drivers: [],
    });
    expect(r).toMatchObject({ direction: 'down', good: true, main: null });
    expect(r.factors.every((f) => f.effect === 'better')).toBe(true);
  });
});
