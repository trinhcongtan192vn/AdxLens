import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import type { ActorCtx } from '@adxlens/core/shared';
import { computeMetrics, entityMetricValues, pctChange, type MetricKey, type MetricValues } from './metric-catalog';
import type { DateRange } from './metrics';

export const AD_FORMATS = ['image', 'video', 'carousel', 'dynamic', 'text', 'other'] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

/** object_type của creative Meta → loại hiển thị (Madgicx: Image / Dynamic / Text / Carousel / Video). */
export function adFormat(objectType: string | null | undefined, hasVideo = false): AdFormat {
  const t = (objectType ?? '').toUpperCase();
  if (t === 'VIDEO' || hasVideo) return 'video';
  if (t === 'PHOTO' || t === 'IMAGE' || t === 'SHARE') return 'image';
  if (t.includes('CAROUSEL') || t === 'MULTI_SHARE') return 'carousel';
  if (t.includes('DYNAMIC') || t === 'PRODUCT' || t === 'TEMPLATE') return 'dynamic';
  if (t === 'STATUS' || t === 'TEXT') return 'text';
  return 'other';
}

export type AdCard = {
  adAccountId: string;
  metaId: string;
  name: string | null;
  status: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  objective: string | null;
  format: AdFormat;
  thumbnailUrl: string | null;
  metrics: MetricValues;
  prev: MetricValues | null;
};

/**
 * Lưới theo từng quảng cáo (Madgicx Workspace "Ads"): thumbnail, loại, mục tiêu chiến dịch, mọi chỉ số kỳ này + kỳ
 * trước (giao diện chọn 4). Chỉ quảng cáo có chi tiêu hoặc đang chạy trong kỳ.
 */
export async function adsGrid(
  ctx: ActorCtx,
  adAccountIds: string[],
  range: DateRange,
  prevRange: DateRange,
): Promise<AdCard[]> {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  const ids = adAccountIds.filter((id) => allowed.has(id));
  if (!ids.length) return [];
  const [cur, prev, rows] = await Promise.all([
    entityMetricValues(ctx, ids, 'ad', range),
    entityMetricValues(ctx, ids, 'ad', prevRange),
    ctx.db.execute<{
      ad_account_id: string;
      meta_id: string;
      name: string | null;
      status: string | null;
      adset_id: string | null;
      campaign_id: string | null;
      campaign_name: string | null;
      objective: string | null;
      thumbnail_url: string | null;
      object_type: string | null;
      video_id: string | null;
    }>(sql`
      select a.ad_account_id, a.meta_id, a.name, a.status, a.parent_meta_id as adset_id,
        a.attrs->>'campaign_id' as campaign_id, c.name as campaign_name, c.objective,
        coalesce(nullif(cr.attrs->>'image_url', ''), cr.attrs->>'thumbnail_url') as thumbnail_url, cr.attrs->>'format' as object_type, cr.attrs->>'video_id' as video_id
      from analytics.entities a
      left join analytics.entities c
        on c.workspace_id = a.workspace_id and c.ad_account_id = a.ad_account_id and c.entity_type = 'campaign'
        and c.meta_id = a.attrs->>'campaign_id'
      left join analytics.entities cr
        on cr.workspace_id = a.workspace_id and cr.ad_account_id = a.ad_account_id and cr.entity_type = 'creative'
        and cr.meta_id = a.attrs->>'creative_id'
      where a.workspace_id = ${ctx.workspaceId} and a.ad_account_id in ${ids} and a.entity_type = 'ad'`),
  ]);
  const out: AdCard[] = [];
  for (const r of rows) {
    const m = cur.get(r.meta_id);
    if (!m && r.status !== 'ACTIVE') continue;
    out.push({
      adAccountId: r.ad_account_id,
      metaId: r.meta_id,
      name: r.name,
      status: r.status,
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      adsetId: r.adset_id,
      objective: r.objective,
      format: adFormat(r.object_type, Boolean(r.video_id)),
      thumbnailUrl: r.thumbnail_url,
      metrics: m ?? computeMetrics(undefined),
      prev: prev.get(r.meta_id) ?? null,
    });
  }
  return out.sort((a, b) => Number(b.metrics.spend) - Number(a.metrics.spend));
}

/** % thay đổi của một chỉ số trên thẻ. */
export function cardChange(c: AdCard, k: MetricKey): number | null {
  return pctChange(c.metrics[k], c.prev?.[k] ?? null);
}
