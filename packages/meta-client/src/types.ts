import { z } from 'zod';

/**
 * Schema phản hồi Meta Marketing API (validate mọi phản hồi, CLAUDE.md). Số tiền giữ dạng chuỗi như
 * Meta trả về để không mất chính xác; ingestion chuyển sang numeric.
 */
const numStr = z.union([z.string(), z.number()]).transform((v) => String(v));

export const pagingSchema = z
  .object({
    cursors: z.object({ before: z.string().optional(), after: z.string().optional() }).optional(),
    next: z.string().optional(),
  })
  .optional();

export const adAccountSchema = z.object({
  id: z.string().regex(/^act_\d+$/),
  name: z.string().default(''),
  currency: z.string().length(3),
  timezone_name: z.string(),
  account_status: z.number().optional(),
});
export type MetaAdAccount = z.infer<typeof adAccountSchema>;

export const meSchema = z.object({ id: z.string(), name: z.string().optional() });

/**
 * Tài sản (ADR-0016): chỉ đọc danh sách. Schema KHÔNG có `access_token` — zod bỏ trường lạ, nên page token Meta có trả
 * thì cũng không đi tiếp.
 */
export const pageSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  category: z.string().nullish(),
  instagram_business_account: z.object({ id: z.string(), username: z.string().nullish() }).nullish(),
});
export type MetaPage = z.infer<typeof pageSchema>;

export const pixelSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  last_fired_time: z.string().nullish(),
});
export type MetaPixel = z.infer<typeof pixelSchema>;

export const businessSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  owned_product_catalogs: z
    .object({ data: z.array(z.object({ id: z.string(), name: z.string().default('') })) })
    .nullish(),
});
export type MetaBusiness = z.infer<typeof businessSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  status: z.string().nullish(),
  effective_status: z.string().nullish(),
  objective: z.string().nullish(),
  daily_budget: numStr.nullish(),
  lifetime_budget: numStr.nullish(),
});

export const adsetSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  campaign_id: z.string(),
  status: z.string().nullish(),
  effective_status: z.string().nullish(),
  optimization_goal: z.string().nullish(),
  daily_budget: numStr.nullish(),
  lifetime_budget: numStr.nullish(),
  learning_stage_info: z.object({ status: z.string().optional() }).nullish(),
  promoted_object: z.record(z.string(), z.unknown()).nullish(),
  /** Chỉ custom audience đưa vào / loại trừ (phân loại giai đoạn phễu); không lưu cả targeting. */
  targeting: z
    .object({
      custom_audiences: z.array(z.object({ id: z.string(), name: z.string().nullish() })).nullish(),
      excluded_custom_audiences: z.array(z.object({ id: z.string(), name: z.string().nullish() })).nullish(),
    })
    .nullish(),
});

export const adSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  adset_id: z.string(),
  campaign_id: z.string().nullish(),
  status: z.string().nullish(),
  effective_status: z.string().nullish(),
  creative: z.object({ id: z.string() }).nullish(),
});

export const creativeSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
  image_url: z.string().nullish(),
  object_type: z.string().nullish(),
  video_id: z.string().nullish(),
  /** Chữ quảng cáo / tiêu đề / URL đích / CTA (Ad Copy Insights, phễu theo trang đích). */
  body: z.string().nullish(),
  title: z.string().nullish(),
  link_url: z.string().nullish(),
  call_to_action_type: z.string().nullish(),
  object_story_spec: z
    .object({
      link_data: z
        .object({ link: z.string().nullish(), message: z.string().nullish(), name: z.string().nullish() })
        .nullish(),
      video_data: z
        .object({
          message: z.string().nullish(),
          title: z.string().nullish(),
          call_to_action: z.object({ value: z.object({ link: z.string().nullish() }).nullish() }).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

/** Custom audience của ad account (loại: CUSTOM = danh sách khách, WEBSITE, ENGAGEMENT, LOOKALIKE…). */
export const customAudienceSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  subtype: z.string().nullish(),
});
export type MetaCustomAudience = z.infer<typeof customAudienceSchema>;

export type MetaCampaign = z.infer<typeof campaignSchema>;
export type MetaAdSet = z.infer<typeof adsetSchema>;
export type MetaAd = z.infer<typeof adSchema>;
export type MetaCreative = z.infer<typeof creativeSchema>;

const actionSchema = z
  .object({ action_type: z.string(), value: numStr })
  .catchall(z.union([z.string(), z.number()]).transform((v) => String(v)));
export type MetaAction = z.infer<typeof actionSchema>;

export const insightSchema = z.object({
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_stop: z.string(),
  account_id: z.string().optional(),
  campaign_id: z.string().optional(),
  adset_id: z.string().optional(),
  ad_id: z.string().optional(),
  spend: numStr.default('0'),
  impressions: numStr.default('0'),
  reach: numStr.default('0'),
  frequency: numStr.optional(),
  clicks: numStr.default('0'),
  inline_link_clicks: numStr.optional(),
  actions: z.array(actionSchema).optional(),
  action_values: z.array(actionSchema).optional(),
  // Trường nhóm khi có `breakdowns` (A4).
  age: z.string().optional(),
  gender: z.string().optional(),
  publisher_platform: z.string().optional(),
  platform_position: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
});
export type MetaInsight = z.infer<typeof insightSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    message: z.string().default(''),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
  }),
});

export const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});
export type MetaToken = z.infer<typeof tokenSchema>;

export type EntityLevel = 'campaign' | 'adset' | 'ad' | 'creative';

/** Cửa sổ attribution mặc định khớp Ads Manager (PRD 7.2). */
export const DEFAULT_ATTRIBUTION = ['7d_click', '1d_view'] as const;

/** Một lời gọi Meta đã hoàn tất, để ghi job_audit (không chứa token). */
export type MetaCallAudit = {
  endpoint: string;
  account: string | null;
  durationMs: number;
  status: number;
  errorCode: number | null;
  attempt: number;
};
