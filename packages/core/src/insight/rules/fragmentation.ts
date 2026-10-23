import type { Rule } from '../types';
import { isActive, moneyThreshold, windowEvidence } from './helpers';

/**
 * Phân mảnh (PRD 9.4): campaign có nhiều ad set ngân sách nhỏ hoặc đang "học hạn chế" — mỗi ad set
 * không đủ sự kiện để tối ưu. Không ước tính tiền.
 */
export const fragmentation: Rule<{
  minSmallAdsets: number;
  minShare: number;
  smallBudgetVnd: number;
  smallBudgetOther: number;
}> = {
  id: 'fragmentation',
  group: 'structure',
  phase: 'P0',
  defaults: { minSmallAdsets: 4, minShare: 0.5, smallBudgetVnd: 100_000, smallBudgetOther: 5 },
  minData: 'Campaign có ≥ 4 ad set đang chạy; cần ngân sách ngày hoặc trạng thái học từ Meta.',
  detect(s, c) {
    const small = moneyThreshold(s, c.smallBudgetVnd, c.smallBudgetOther);
    const out = [];
    for (const camp of s.campaigns) {
      if (!isActive(camp)) continue;
      const adsets = s.adsets.filter((a) => a.parentMetaId === camp.metaId && isActive(a));
      if (adsets.length < c.minSmallAdsets) continue;
      const hasSignal = adsets.some((a) => a.dailyBudget !== null || a.learningStage !== null);
      if (!hasSignal) continue;
      const weak = adsets.filter(
        (a) => (a.dailyBudget !== null && Number(a.dailyBudget) < small) || a.learningStage === 'LEARNING_LIMITED',
      );
      if (weak.length < c.minSmallAdsets || weak.length / adsets.length < c.minShare) continue;
      out.push({
        entityType: 'campaign' as const,
        metaId: camp.metaId,
        entityName: camp.name,
        severity: 'medium' as const,
        impactEstimate: null,
        impactMethod: null,
        evidence: {
          window: windowEvidence(s),
          metrics: {
            adsets: adsets.length,
            weak_adsets: weak.length,
            small_budget_threshold: small,
            weak_ids: weak.map((a) => a.metaId),
          },
        },
        why: { key: 'rules.fragmentation.why', params: { weak: weak.length, total: adsets.length } },
        whatToDo: { key: 'rules.fragmentation.what' },
      });
    }
    return out;
  },
};
