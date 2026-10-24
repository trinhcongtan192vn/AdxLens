import { describe, expect, it } from 'vitest';
import { creativeInsights, type CreativePoint } from './index';

const p = (key: string, format: string, spend: string, value: string, results = 0): CreativePoint => ({
  key,
  name: key,
  format,
  spend,
  conversionValue: value,
  results,
  impressions: 1000,
  linkClicks: 20,
});

describe('Creative Insights (cải tiến cổ điển)', () => {
  it('theo định dạng: % chi tiêu, % doanh thu, ROAS, CTR, CVR; thiếu định dạng', () => {
    const r = creativeInsights([
      p('v1', 'VIDEO', '300', '900', 3),
      p('i1', 'PHOTO', '100', '100', 1),
      p('i2', 'PHOTO', '100', '0', 0),
      p('z', 'PHOTO', '0', '0'),
    ]);
    expect(r.valueBasis).toBe('revenue');
    expect(r.formats.map((f) => [f.format, f.creatives, f.spendShare, f.valueShare, f.roas])).toEqual([
      ['video', 1, 60, 90, '3.00'],
      ['image', 2, 40, 10, '0.50'],
    ]);
    expect(r.formats[0]!.ctr).toBe(2);
    expect(r.formats[0]!.cvr).toBe(15);
    expect(r.missing).toEqual(['carousel']);
  });

  it('ma trận 4 góc theo trung vị chi tiêu × doanh thu; không có doanh thu thì dùng kết quả', () => {
    const r = creativeInsights([
      p('core', 'PHOTO', '500', '2000'),
      p('over', 'PHOTO', '400', '10'),
      p('scal', 'PHOTO', '50', '900'),
      p('start', 'PHOTO', '40', '5'),
    ]);
    expect(Object.fromEntries(r.matrix.map((m) => [m.key, m.quadrant]))).toEqual({
      core: 'core',
      over: 'overspend',
      scal: 'scalable',
      start: 'getting_started',
    });
    expect(creativeInsights([p('a', 'VIDEO', '10', '0', 5)]).valueBasis).toBe('results');
  });
});
