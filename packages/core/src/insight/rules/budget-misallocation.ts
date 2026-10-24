import { mulRatio } from '@adxlens/core/shared';
import type { Rule } from '../types';
import { cpa, goalOf, isActive, median, moneyThreshold, round2, spendOf, windowEvidence } from './helpers';

/**
 * Phân bổ ngân sách (PRD 9.4): ad set chi tiêu cao nhưng CPA kém đáng kể so với trung vị các ad set cùng
 * mục tiêu tối ưu trong tài khoản. Tác động: chi tiêu × (1 − CPA trung vị / CPA ad set).
 */
export const budgetMisallocation: Rule<{
  minPeers: number;
  minResults: number;
  minSpendShare: number;
  cpaRatio: number;
  highCpaRatio: number;
  minSpendVnd: number;
  minSpendOther: number;
}> = {
  id: 'budget_misallocation',
  group: 'budget',
  phase: 'P0',
  defaults: {
    minPeers: 3,
    minResults: 5,
    minSpendShare: 0.15,
    cpaRatio: 1.5,
    highCpaRatio: 2,
    minSpendVnd: 1_000_000,
    minSpendOther: 50,
  },
  minData:
    'Ít nhất 3 ad set cùng mục tiêu, mỗi ad set ≥ 5 kết quả trong 7 ngày; ad set chi tiêu ≥ ngưỡng theo tiền tệ.',
  detect(s, c) {
    const minSpend = moneyThreshold(s, c.minSpendVnd, c.minSpendOther);
    const byGoal = new Map<string, typeof s.adsets>();
    for (const a of s.adsets) {
      const g = goalOf(a);
      if (!g || !isActive(a)) continue;
      byGoal.set(g, [...(byGoal.get(g) ?? []), a]);
    }
    const out = [];
    for (const [goal, adsets] of byGoal) {
      const peers = adsets.filter((a) => a.cur.results >= c.minResults);
      if (peers.length < c.minPeers) continue;
      const med = median(peers.map((a) => cpa(a.cur)));
      const goalSpend = adsets.reduce((t, a) => t + spendOf(a.cur), 0);
      for (const a of peers) {
        const spend = spendOf(a.cur);
        const ratio = cpa(a.cur) / med;
        if (spend < minSpend || goalSpend <= 0 || spend / goalSpend < c.minSpendShare || ratio < c.cpaRatio) continue;
        out.push({
          entityType: 'adset' as const,
          metaId: a.metaId,
          entityName: a.name,
          severity: ratio >= c.highCpaRatio ? ('high' as const) : ('medium' as const),
          impactEstimate: mulRatio(a.cur.spend, 1 - 1 / ratio),
          impactMethod: 'rules.budget_misallocation.impact',
          evidence: {
            window: windowEvidence(s),
            goal,
            metrics: {
              cpa: round2(cpa(a.cur)),
              median_cpa: round2(med),
              spend: a.cur.spend,
              spend_share: round2(spend / goalSpend),
              results: a.cur.results,
            },
          },
          why: {
            key: 'rules.budget_misallocation.why',
            params: { ratio: round2(ratio), share: Math.round((spend / goalSpend) * 100) },
          },
          whatToDo: { key: 'rules.budget_misallocation.what' },
        });
      }
    }
    return out;
  },
};
