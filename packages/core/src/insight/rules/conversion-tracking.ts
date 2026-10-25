import type { Rule } from '../types';
import { pct } from './helpers';

const avg = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);

/**
 * Theo dõi chuyển đổi (PRD 9.4): kết quả cấp tài khoản sụt mạnh trong 3 ngày gần nhất so với 14 ngày
 * trước, trong khi chi tiêu và click liên kết không giảm tương ứng → nghi pixel/sự kiện lỗi.
 */
export const conversionTracking: Rule<{
  recentDays: number;
  baselineDays: number;
  minBaselinePerDay: number;
  minDrop: number;
  maxTrafficDrop: number;
}> = {
  id: 'conversion_tracking',
  group: 'tracking',
  phase: 'P0',
  defaults: { recentDays: 3, baselineDays: 14, minBaselinePerDay: 5, minDrop: 0.7, maxTrafficDrop: 0.3 },
  minData: '≥ 17 ngày dữ liệu cấp tài khoản; nền ≥ 5 kết quả/ngày.',
  detect(s, c) {
    const days = s.daily;
    if (days.length < c.recentDays + c.baselineDays) return [];
    const recent = days.slice(-c.recentDays);
    const base = days.slice(-(c.recentDays + c.baselineDays), -c.recentDays);
    const baseRes = avg(base.map((d) => d.results));
    if (baseRes < c.minBaselinePerDay) return [];
    const drop = 1 - avg(recent.map((d) => d.results)) / baseRes;
    const spendBase = avg(base.map((d) => Number(d.spend)));
    const clickBase = avg(base.map((d) => d.linkClicks));
    const spendDrop = spendBase > 0 ? 1 - avg(recent.map((d) => Number(d.spend))) / spendBase : 1;
    const clickDrop = clickBase > 0 ? 1 - avg(recent.map((d) => d.linkClicks)) / clickBase : 1;
    if (drop < c.minDrop || spendDrop > c.maxTrafficDrop || clickDrop > c.maxTrafficDrop) return [];
    return [
      {
        entityType: 'account' as const,
        metaId: s.account.metaAccountId,
        entityName: s.account.name,
        severity: 'high' as const,
        impactEstimate: null,
        impactMethod: null,
        evidence: {
          recent: [recent[0]!.date, recent.at(-1)!.date],
          baseline: [base[0]!.date, base.at(-1)!.date],
          metrics: {
            results_per_day: [Math.round(baseRes * 10) / 10, Math.round(avg(recent.map((d) => d.results)) * 10) / 10],
            spend_drop: pct(Math.max(0, spendDrop)),
            click_drop: pct(Math.max(0, clickDrop)),
          },
        },
        why: { key: 'rules.conversion_tracking.why', params: { drop: pct(drop), days: c.recentDays } },
        whatToDo: { key: 'rules.conversion_tracking.what' },
      },
    ];
  },
};
