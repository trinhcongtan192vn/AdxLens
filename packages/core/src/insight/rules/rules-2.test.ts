import { describe, expect, it } from 'vitest';
import { ent, snapshot } from '../testing';
import { isDefaultName } from './account-hygiene';
import { accountHygiene, conversionTracking, learningLimited, spendNoConversion } from './index';

type Out = {
  metaId: string;
  severity: string;
  impactEstimate: string | null;
  entityType: string;
  why: { key: string };
};
const run = <C extends Record<string, number>>(
  r: { detect: (s: ReturnType<typeof snapshot>, c: C) => unknown[]; defaults: C },
  s: ReturnType<typeof snapshot>,
) => r.detect(s, r.defaults) as Out[];

describe('learning_limited', () => {
  it('trạng thái từ API → phát hiện; mức theo tỷ trọng chi tiêu', () => {
    const s = snapshot({
      adsets: [
        ent('a', { learningStage: 'LEARNING_LIMITED', cur: { spend: '900000', results: 10 } }),
        ent('b', { learningStage: 'LEARNING_LIMITED', cur: { spend: '50000', results: 1 } }),
        ent('c', { learningStage: 'SUCCESS', cur: { spend: '50000', results: 60 } }),
      ],
    });
    const r = run(learningLimited, s);
    expect(r.map((x) => [x.metaId, x.severity])).toEqual([
      ['a', 'medium'],
      ['b', 'low'],
    ]);
  });
  it('API không có trạng thái: suy từ < 50 kết quả/tuần khi đã chạy đủ 7 ngày', () => {
    const s = snapshot({ adsets: [ent('a', { cur: { spend: '100', results: 12, activeDays: 7 } })] });
    expect(run(learningLimited, s)[0]!.why.key).toBe('rules.learning_limited.whyInferred');
  });
  it('không đủ dữ liệu (chạy < 5 ngày, hoặc < 7 ngày khi phải suy) → không phát hiện', () => {
    expect(
      run(
        learningLimited,
        snapshot({ adsets: [ent('a', { learningStage: 'LEARNING_LIMITED', cur: { activeDays: 3 } })] }),
      ),
    ).toEqual([]);
    expect(run(learningLimited, snapshot({ adsets: [ent('a', { cur: { results: 2, activeDays: 6 } })] }))).toEqual([]);
  });
});

describe('spend_no_conversion', () => {
  const lead = (id: string, spend: string, results: number, activeDays = 7) =>
    ent(id, { attrs: { optimization_goal: 'LEAD_GENERATION' }, cur: { spend, results, activeDays } });
  it('tiêu vượt ngưỡng, 0 lead, tài khoản vẫn có lead ở nơi khác → phát hiện, tác động = chi tiêu', () => {
    const r = run(spendNoConversion, snapshot({ adsets: [lead('ok', '2000000', 40), lead('bad', '3500000', 0)] }));
    expect(r).toMatchObject([{ metaId: 'bad', severity: 'high', impactEstimate: '3500000' }]);
  });
  it('dưới ngưỡng → medium hoặc không; mục tiêu click không áp dụng', () => {
    expect(
      run(spendNoConversion, snapshot({ adsets: [lead('ok', '1', 40), lead('bad', '1500000', 0)] }))[0]!.severity,
    ).toBe('medium');
    expect(run(spendNoConversion, snapshot({ adsets: [lead('ok', '1', 40), lead('bad', '500000', 0)] }))).toEqual([]);
    const click = ent('c', { attrs: { optimization_goal: 'LINK_CLICKS' }, cur: { spend: '9000000', results: 0 } });
    expect(run(spendNoConversion, snapshot({ adsets: [click] }))).toEqual([]);
  });
  it('cả tài khoản không có kết quả (nghi lỗi theo dõi) hoặc ít ngày → không phát hiện', () => {
    expect(run(spendNoConversion, snapshot({ adsets: [lead('bad', '9000000', 0)] }))).toEqual([]);
    expect(run(spendNoConversion, snapshot({ adsets: [lead('ok', '1', 40), lead('bad', '9000000', 0, 2)] }))).toEqual(
      [],
    );
  });
});

describe('account_hygiene', () => {
  it('tên mặc định / bản sao', () => {
    for (const n of [
      'New Campaign',
      'New Ad Set 3',
      'Chiến dịch mới',
      'Video Tết - Copy',
      'Video Tết – Bản sao 2',
      '',
      null,
    ]) {
      expect(isDefaultName(n), String(n)).toBe(true);
    }
    for (const n of ['Video A - Tết', 'Bán hàng · 0001', 'LAL 1%', 'Copywriting test']) {
      expect(isDefaultName(n), n).toBe(false);
    }
  });
  it('đang bật mà 7 ngày không chi tiêu (campaign/ad set); đối tượng đã tắt bỏ qua', () => {
    const s = snapshot({
      campaigns: [
        ent('c1', { name: 'Bán hàng', cur: { spend: '0' } }),
        ent('c2', { name: 'Thu lead', cur: { spend: '10' } }),
      ],
      adsets: [ent('s1', { name: 'Ad set cũ', status: 'PAUSED', cur: { spend: '0' } })],
      ads: [ent('a1', { name: 'New Ad', cur: { spend: '5' } })],
    });
    expect(run(accountHygiene, s).map((x) => `${x.entityType}:${x.metaId}:${x.why.key}`)).toEqual([
      'campaign:c1:rules.account_hygiene.whyIdle',
      'ad:a1:rules.account_hygiene.whyName',
    ]);
  });
  it('chưa đủ 7 ngày dữ liệu → không báo "không chi tiêu"', () => {
    const s = snapshot({ daysWithData: 3, campaigns: [ent('c1', { name: 'Bán hàng', cur: { spend: '0' } })] });
    expect(run(accountHygiene, s)).toEqual([]);
  });
});

describe('conversion_tracking', () => {
  const series = (recentResults: number, recentSpend = 1000000, n = 17) =>
    Array.from({ length: n }, (_, i) => {
      const recent = i >= n - 3;
      return {
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        spend: String(recent ? recentSpend : 1000000),
        results: recent ? recentResults : 20,
        linkClicks: 500,
      };
    });
  it('kết quả sụt 90% trong khi chi tiêu/click giữ nguyên → high', () => {
    const r = run(conversionTracking, snapshot({ daily: series(2) }));
    expect(r).toMatchObject([{ entityType: 'account', metaId: 'act_1', severity: 'high' }]);
  });
  it('chi tiêu cũng giảm (tắt quảng cáo) → không phải lỗi theo dõi', () => {
    expect(run(conversionTracking, snapshot({ daily: series(2, 100000) }))).toEqual([]);
  });
  it('không đủ dữ liệu (< 17 ngày, nền < 5/ngày) hoặc giảm ít → không phát hiện', () => {
    expect(run(conversionTracking, snapshot({ daily: series(2, 1000000, 10) }))).toEqual([]);
    expect(run(conversionTracking, snapshot({ daily: series(15) }))).toEqual([]);
    const low = series(0).map((d, i) => (i < 14 ? { ...d, results: 3 } : d));
    expect(run(conversionTracking, snapshot({ daily: low }))).toEqual([]);
  });
});
