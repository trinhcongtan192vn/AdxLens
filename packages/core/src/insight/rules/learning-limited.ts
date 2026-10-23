import type { Rule } from '../types';
import { isActive, round2, spendOf, windowEvidence } from './helpers';

/**
 * Learning limited (PRD 9.4): trạng thái học từ API là `LEARNING_LIMITED`; nếu API không trả trạng thái
 * thì suy từ số kết quả trong 7 ngày (< 50, ngưỡng Meta cần để thoát học) khi ad set đã chạy đủ 7 ngày.
 */
export const learningLimited: Rule<{ minActiveDays: number; weeklyEvents: number; mediumSpendShare: number }> = {
  id: 'learning_limited',
  group: 'learning',
  phase: 'P0',
  defaults: { minActiveDays: 5, weeklyEvents: 50, mediumSpendShare: 0.1 },
  minData: 'Ad set đang chạy, ≥ 5 ngày có chi tiêu trong 7 ngày gần nhất.',
  detect(s, c) {
    const total = s.adsets.reduce((t, a) => t + spendOf(a.cur), 0);
    return s.adsets.flatMap((a) => {
      if (!isActive(a) || a.cur.activeDays < c.minActiveDays) return [];
      const fromApi = a.learningStage === 'LEARNING_LIMITED';
      const inferred = a.learningStage === null && a.cur.activeDays >= 7 && a.cur.results < c.weeklyEvents;
      if (!fromApi && !inferred) return [];
      const share = total > 0 ? spendOf(a.cur) / total : 0;
      return [
        {
          entityType: 'adset' as const,
          metaId: a.metaId,
          entityName: a.name,
          severity: share >= c.mediumSpendShare ? ('medium' as const) : ('low' as const),
          impactEstimate: null,
          impactMethod: null,
          evidence: {
            window: windowEvidence(s),
            source: fromApi ? 'api' : 'inferred',
            metrics: { results_7d: a.cur.results, weekly_events_needed: c.weeklyEvents, spend_share: round2(share) },
          },
          why: {
            key: fromApi ? 'rules.learning_limited.why' : 'rules.learning_limited.whyInferred',
            params: { results: a.cur.results, needed: c.weeklyEvents },
          },
          whatToDo: { key: 'rules.learning_limited.what' },
        },
      ];
    });
  },
};
