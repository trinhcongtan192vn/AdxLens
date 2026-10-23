import type { Rule } from '../types';
import { CONVERSION_GOALS, goalOf, isActive, moneyThreshold, spendOf, windowEvidence } from './helpers';

/**
 * Chi tiêu không chuyển đổi (PRD 9.4): ad set tối ưu cho chuyển đổi tiêu vượt ngưỡng trong 7 ngày mà
 * không có kết quả. Chỉ báo khi tài khoản vẫn ghi nhận chuyển đổi cùng loại ở nơi khác (tránh nhầm với lỗi
 * theo dõi — quy tắc `conversion_tracking` lo phần đó). Tác động = toàn bộ chi tiêu 7 ngày.
 */
export const spendNoConversion: Rule<{
  minSpendVnd: number;
  minSpendOther: number;
  minActiveDays: number;
  highMultiple: number;
}> = {
  id: 'spend_no_conversion',
  group: 'waste',
  phase: 'P0',
  defaults: { minSpendVnd: 1_000_000, minSpendOther: 50, minActiveDays: 3, highMultiple: 3 },
  minData:
    'Ad set tối ưu cho chuyển đổi, ≥ 3 ngày có chi tiêu; tài khoản có kết quả cùng mục tiêu ở ad set khác trong 7 ngày.',
  detect(s, c) {
    const threshold = moneyThreshold(s, c.minSpendVnd, c.minSpendOther);
    const resultsByGoal = new Map<string, number>();
    for (const a of s.adsets) {
      const g = goalOf(a);
      if (g) resultsByGoal.set(g, (resultsByGoal.get(g) ?? 0) + a.cur.results);
    }
    return s.adsets.flatMap((a) => {
      const g = goalOf(a);
      if (!g || !CONVERSION_GOALS.has(g) || !isActive(a)) return [];
      if (a.cur.activeDays < c.minActiveDays || a.cur.results > 0) return [];
      const spend = spendOf(a.cur);
      if (spend < threshold || (resultsByGoal.get(g) ?? 0) <= 0) return [];
      return [
        {
          entityType: 'adset' as const,
          metaId: a.metaId,
          entityName: a.name,
          severity: spend >= threshold * c.highMultiple ? ('high' as const) : ('medium' as const),
          impactEstimate: a.cur.spend,
          impactMethod: 'rules.spend_no_conversion.impact',
          evidence: {
            window: windowEvidence(s),
            goal: g,
            metrics: { spend: a.cur.spend, results: 0, link_clicks: a.cur.linkClicks, threshold },
          },
          why: { key: 'rules.spend_no_conversion.why', params: { days: a.cur.activeDays } },
          whatToDo: { key: 'rules.spend_no_conversion.what' },
        },
      ];
    });
  },
};
