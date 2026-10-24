import type { Rule } from '../types';
import { cpa, isActive, pct, round2, spendOf, windowEvidence } from './helpers';

/**
 * Ad thắng bị bỏ đói (PRD 9.4): trong một ad set, ad có CPA tốt hơn hẳn ad set nhưng nhận phần nhỏ chi
 * tiêu, và đủ kết quả để có ý nghĩa. Không ước tính tiền (tác động là cơ hội, không phải lãng phí).
 */
export const starvedWinner: Rule<{
  minResults: number;
  maxSpendShare: number;
  cpaRatio: number;
  minAdsInAdset: number;
}> = {
  id: 'starved_winner',
  group: 'budget',
  phase: 'P0',
  defaults: { minResults: 5, maxSpendShare: 0.15, cpaRatio: 0.7, minAdsInAdset: 2 },
  minData: 'Ad có ≥ 5 kết quả trong 7 ngày; ad set có ≥ 2 ad đang chạy và có kết quả.',
  detect(s, c) {
    const out = [];
    for (const adset of s.adsets) {
      if (!isActive(adset) || adset.cur.results <= 0) continue;
      const ads = s.ads.filter((a) => a.parentMetaId === adset.metaId && isActive(a));
      if (ads.length < c.minAdsInAdset) continue;
      const total = ads.reduce((t, a) => t + spendOf(a.cur), 0);
      const adsetCpa = cpa(adset.cur);
      for (const ad of ads) {
        if (ad.cur.results < c.minResults || total <= 0) continue;
        const share = spendOf(ad.cur) / total;
        const ratio = cpa(ad.cur) / adsetCpa;
        if (share > c.maxSpendShare || ratio > c.cpaRatio) continue;
        out.push({
          entityType: 'ad' as const,
          metaId: ad.metaId,
          entityName: ad.name,
          severity: 'medium' as const,
          impactEstimate: null,
          impactMethod: null,
          evidence: {
            window: windowEvidence(s),
            metrics: {
              cpa: round2(cpa(ad.cur)),
              adset_cpa: round2(adsetCpa),
              spend_share: round2(share),
              results: ad.cur.results,
            },
          },
          why: {
            key: 'rules.starved_winner.why',
            params: { better: pct(1 - ratio), share: Math.round(share * 100) },
          },
          whatToDo: { key: 'rules.starved_winner.what' },
        });
      }
    }
    return out;
  },
};
