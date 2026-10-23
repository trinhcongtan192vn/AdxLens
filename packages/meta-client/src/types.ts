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
});

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
