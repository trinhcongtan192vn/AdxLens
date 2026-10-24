import 'server-only';
import { z } from 'zod';
import type { CreativeRow } from '@adxlens/core/recommendation';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const creativeQuery = z
  .object({ account_id: z.string().uuid(), from: isoDate, to: isoDate })
  .refine((q) => q.from <= q.to, { message: 'from > to' });

export const creativeDto = (r: CreativeRow) => ({
  key: r.key,
  ad_account_id: r.adAccountId,
  creative_id: r.creativeId,
  name: r.name,
  thumbnail_url: r.thumbnailUrl,
  format: r.format,
  ad_count: r.adCount,
  first_date: r.firstDate,
  last_date: r.lastDate,
  result_type: r.resultType,
  metrics: {
    spend: r.metrics.spend,
    impressions: r.metrics.impressions,
    link_clicks: r.metrics.linkClicks,
    results: r.metrics.results,
    ctr: r.metrics.ctr,
    cpa: r.metrics.cpa,
    roas: r.metrics.roas,
    frequency: r.metrics.frequency,
  },
  class: r.class,
  reason: r.reason,
  forecast: r.forecast,
});
