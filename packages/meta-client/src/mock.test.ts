import { describe, expect, it } from 'vitest';
import { MOCK_ACCOUNTS, MOCK_DISCREPANCY, MockMetaRead } from './mock';

const now = new Date('2026-10-23T05:00:00Z'); // 12:00 giờ VN
const meta = new MockMetaRead(() => now);

describe('Meta mock', () => {
  it('xác định: cùng đầu vào cho cùng kết quả', async () => {
    const q = { level: 'ad' as const, since: '2026-10-10', until: '2026-10-12' };
    expect(await meta.getInsights('', 'act_100000001', q)).toEqual(await meta.getInsights('', 'act_100000001', q));
  });

  it('chỉ có dữ liệu tới hôm qua theo múi giờ tài khoản', async () => {
    const rows = await meta.getInsights('', 'act_100000001', {
      level: 'account',
      since: '2026-10-20',
      until: '2026-10-25',
    });
    expect(rows.map((r) => r.date_start)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });

  it('spend mức account = tổng mức ad, trừ đúng ngày cài lệch 1,4%', async () => {
    for (const acc of MOCK_ACCOUNTS) {
      const q = { since: '2026-10-15', until: '2026-10-22' };
      const ads = await meta.getInsights('', acc.id, { ...q, level: 'ad' });
      const accRows = await meta.getInsights('', acc.id, { ...q, level: 'account' });
      for (const row of accRows) {
        const sum = ads.filter((a) => a.date_start === row.date_start).reduce((t, a) => t + Number(a.spend), 0);
        const ratio = Number(row.spend) / sum;
        const isBad = acc.id === MOCK_DISCREPANCY.account && row.date_start === '2026-10-20';
        if (isBad) expect(ratio).toBeCloseTo(MOCK_DISCREPANCY.factor, 3);
        else expect(Math.abs(ratio - 1)).toBeLessThan(0.0005);
      }
    }
  });

  it('cấu trúc có learning limited và chiến dịch phân mảnh', async () => {
    const adsets = await meta.listAdSets('', 'act_100000001');
    expect(adsets.some((s) => s.learning_stage_info?.status === 'LEARNING_LIMITED')).toBe(true);
    const ads = await meta.listAds('', 'act_100000001');
    const creatives = await meta.listCreatives('', 'act_100000001');
    expect(ads.every((a) => creatives.some((c) => c.id === a.creative?.id))).toBe(true);
  });
});

describe('Meta giả: breakdowns (A4)', () => {
  it('tách theo nhóm cộng lại đúng tổng của ad set (chi tiêu, hiển thị, click, kết quả)', async () => {
    const m = new MockMetaRead(() => new Date('2026-10-23T05:00:00Z'));
    const q = { level: 'adset' as const, since: '2026-10-20', until: '2026-10-20' };
    const total = await m.getInsights('t', 'act_100000001', q);
    for (const breakdown of ['age_gender', 'placement', 'region'] as const) {
      const parts = await m.getInsights('t', 'act_100000001', { ...q, breakdown });
      for (const row of total) {
        const mine = parts.filter((p) => p.adset_id === row.adset_id);
        expect(mine.length).toBeGreaterThan(1);
        const sum = (k: 'spend' | 'impressions' | 'inline_link_clicks') =>
          mine.reduce((t, p) => t + Number(p[k] ?? 0), 0);
        expect(sum('spend')).toBeCloseTo(Number(row.spend), 6);
        expect(sum('impressions')).toBe(Number(row.impressions));
        expect(sum('inline_link_clicks')).toBe(Number(row.inline_link_clicks ?? 0));
        const acts = (rows: typeof mine) =>
          rows.flatMap((p) => p.actions ?? []).reduce((t, a) => t + Number(a.value), 0);
        expect(acts(mine)).toBe(acts([row]));
      }
    }
    const ag = await m.getInsights('t', 'act_100000001', { ...q, breakdown: 'age_gender' });
    expect(ag[0]).toMatchObject({ age: '18-24', gender: 'female' });
  });
});
