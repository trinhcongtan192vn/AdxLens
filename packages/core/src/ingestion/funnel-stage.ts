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

export type AdsetAudience = { key: string; name: string | null; type: 'lookalike' | 'custom' | 'interest' | 'broad' };

/**
 * Audience của một nhóm QC cho Top Audiences (Madgicx Audience Studio): custom audience (lookalike / custom theo loại
 * Meta trả), interest / behavior trong targeting; không có gì → "Rộng". Chỉ id + tên, không lưu cả targeting.
 */
export function adsetAudiences(
  targeting:
    | {
        custom_audiences?: { id: string; name?: string | null }[] | null;
        flexible_spec?:
          | {
              interests?: { id: string; name?: string | null }[] | null;
              behaviors?: { id: string; name?: string | null }[] | null;
            }[]
          | null;
      }
    | null
    | undefined,
  subtypes: Map<string, string | null> | null,
): AdsetAudience[] {
  const out: AdsetAudience[] = [];
  for (const a of targeting?.custom_audiences ?? []) {
    const sub = (subtypes?.get(a.id) ?? '').toUpperCase();
    out.push({ key: `ca:${a.id}`, name: a.name ?? null, type: sub === 'LOOKALIKE' ? 'lookalike' : 'custom' });
  }
  for (const f of targeting?.flexible_spec ?? []) {
    for (const i of [...(f.interests ?? []), ...(f.behaviors ?? [])]) {
      out.push({ key: `int:${i.id}`, name: i.name ?? null, type: 'interest' });
    }
  }
  return out.length ? out : [{ key: 'broad', name: null, type: 'broad' }];
}
