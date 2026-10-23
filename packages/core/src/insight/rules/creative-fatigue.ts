import { mulRatio } from '@adxlens/core/shared';
import type { Rule } from '../types';
import { ctr, pct, round2, windowEvidence } from './helpers';

/**
 * Creative fatigue (PRD 9.4): ở cấp ad, tần suất tăng và CTR giảm so với 7 ngày trước.
 * Tác động: chi tiêu 7 ngày × (1 − CTR hiện tại / CTR 7 ngày trước).
 */
export const creativeFatigue: Rule<{
  minActiveDays: number;
  minImpressions: number;
  minBaselineClicks: number;
  minFrequency: number;
  minFrequencyRise: number;
  minCtrDrop: number;
  highCtrDrop: number;
}> = {
  id: 'creative_fatigue',
  group: 'creative',
  phase: 'P0',
  defaults: {
    minActiveDays: 5,
    minImpressions: 3000,
    minBaselineClicks: 30,
    minFrequency: 2.5,
    minFrequencyRise: 0.2,
    minCtrDrop: 0.25,
    highCtrDrop: 0.4,
  },
  minData: 'Mỗi cửa sổ ≥ 5 ngày có chi tiêu; tuần này ≥ 3.000 hiển thị; tuần trước ≥ 30 click liên kết.',
  detect(s, c) {
    return s.ads.flatMap((ad) => {
      const { cur, prev } = ad;
      if (cur.activeDays < c.minActiveDays || prev.activeDays < c.minActiveDays) return [];
      if (cur.impressions < c.minImpressions || prev.linkClicks < c.minBaselineClicks) return [];
      if (cur.frequency < c.minFrequency || prev.frequency <= 0) return [];
      const freqRise = cur.frequency / prev.frequency - 1;
      const ctrPrev = ctr(prev);
      const ctrDrop = ctrPrev > 0 ? 1 - ctr(cur) / ctrPrev : 0;
      if (freqRise < c.minFrequencyRise || ctrDrop < c.minCtrDrop) return [];
      return [
        {
          entityType: 'ad' as const,
          metaId: ad.metaId,
          entityName: ad.name,
          severity: ctrDrop >= c.highCtrDrop ? ('high' as const) : ('medium' as const),
          impactEstimate: mulRatio(cur.spend, ctrDrop),
          impactMethod: 'rules.creative_fatigue.impact',
          evidence: {
            window: windowEvidence(s),
            metrics: {
              frequency: [round2(prev.frequency), round2(cur.frequency)],
              ctr: [Number(ctrPrev.toFixed(4)), Number(ctr(cur).toFixed(4))],
              spend: [prev.spend, cur.spend],
            },
          },
          why: {
            key: 'rules.creative_fatigue.why',
            params: { freqRise: pct(freqRise), ctrDrop: pct(ctrDrop), freq: round2(cur.frequency) },
          },
          whatToDo: { key: 'rules.creative_fatigue.what' },
        },
      ];
    });
  },
};
