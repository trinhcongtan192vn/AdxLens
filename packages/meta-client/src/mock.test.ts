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
