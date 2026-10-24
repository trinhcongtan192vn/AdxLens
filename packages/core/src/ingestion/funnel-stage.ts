import type { MetaCreative } from '@adxlens/meta-client';

export const FUNNEL_STAGES = ['prospecting', 're_engagement', 'retargeting', 'retention'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * Giai đoạn phễu của nhóm QC từ loại custom audience được đưa vào (Madgicx 360° Meta Dashboard):
 * - danh sách khách (CUSTOM / OFFLINE_CONVERSION) → Retention;
 * - website / app / sự kiện (WEBSITE, APP, OFFLINE) → Retargeting;
 * - tương tác (ENGAGEMENT, VIDEO, IG_BUSINESS, PAGE, FB_EVENT, LEAD_AD…) → Re-engagement;
 * - không có audience nóng (rộng, sở thích, lookalike) → Prospecting.
 * Có nhiều loại thì lấy giai đoạn "ấm" nhất. Không đọc được danh sách audience → null (không đoán).
 */
export function funnelStageOf(audienceIds: string[], subtypes: Map<string, string | null> | null): FunnelStage | null {
  if (!audienceIds.length) return 'prospecting';
  if (!subtypes) return null;
  const types = audienceIds.map((id) => (subtypes.get(id) ?? '').toUpperCase());
  if (types.some((t) => t === 'CUSTOM' || t === 'OFFLINE_CONVERSION')) return 'retention';
  if (types.some((t) => t === 'WEBSITE' || t === 'APP' || t === 'OFFLINE')) return 'retargeting';
  if (types.some((t) => t && t !== 'LOOKALIKE')) return 're_engagement';
  return 'prospecting';
}

/** Chữ / tiêu đề / URL đích / CTA của creative (đọc cả object_story_spec khi trường gốc trống). */
export function creativeCopy(c: MetaCreative): {
  body: string | null;
  title: string | null;
  link: string | null;
  cta: string | null;
} {
  const s = c.object_story_spec;
  return {
    body: c.body ?? s?.link_data?.message ?? s?.video_data?.message ?? null,
    title: c.title ?? s?.link_data?.name ?? s?.video_data?.title ?? null,
    link: c.link_url ?? s?.link_data?.link ?? s?.video_data?.call_to_action?.value?.link ?? null,
    cta: c.call_to_action_type ?? null,
  };
}
